import QueueService from './queue.js';
import DatabaseService from './database.js';
import YtdlpService from './ytdlp.js';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Serial, deadline } from '../utils/serial.js';
import { fail, integer, text } from '../utils/validation.js';
import createLogger from '../utils/logger.js';

const log = createLogger('Player');
export const FILTERS = {
    reset: {},
    bassboost: { equalizer: [{ band: 0, gain: 0.2 }, { band: 1, gain: 0.15 }, { band: 2, gain: 0.1 }] },
    nightcore: { timescale: { speed: 1.2, pitch: 1.2, rate: 1 } },
    vaporwave: { timescale: { speed: 0.85, pitch: 0.8, rate: 1 } }
};
export default class PlayerController extends EventEmitter {
    constructor(client, lavalink, { queue = QueueService, database = DatabaseService, extractor = YtdlpService, timeout = 15000 } = {}) {
        super();
        Object.assign(this, { client, lavalink, shoukaku: lavalink.shoukaku, queue, database, extractor, timeout });
        this.currentTracks = new Map();
        this.playerStates = new Map();
        this.generations = new Map();
        this.prefetch = new Map();
        this.serial = new Serial();
        this.revisions = new Map();
        this.options = new Map();
        this.diagnostics = { earlyEndings: 0, failures: 0 };
        this.failureStreaks = new Map();
        this.lastErrors = new Map();
        this.voiceClosed = new Set();
        this.on('failure', failure => { this.lastErrors.set(failure.guildId, failure.message); this.changed(failure.guildId); });
    }
    generation(id) { return this.generations.get(id) || 0; }
    invalidate(id) { this.generations.set(id, this.generation(id) + 1); this.prefetch.delete(id); }
    changed(id) {
        this.revisions.set(id, (this.revisions.get(id) || 0) + 1);
        this.emit('change', id);
    }
    getCurrentTrack(id) { return this.currentTracks.get(id) || null; }
    getPlayerState(id) {
        const state = this.playerStates.get(id);
        if (!state) return null;
        const elapsed = state.paused || !state.connected ? 0 : Date.now() - state.timestamp;
        const speed = (this.options.get(id)?.filter === 'nightcore' ? 1.2 : this.options.get(id)?.filter === 'vaporwave' ? 0.85 : 1);
        const position = Math.max(0, Math.min(state.position + elapsed * speed, state.duration || Infinity));
        return { position: Math.floor(position), duration: state.duration, paused: state.paused, connected: state.connected };
    }
    async snapshot(id) {
        if (!this.options.has(id)) {
            const saved = await this.database.getGuildSettings(id);
            if (!this.options.has(id)) this.options.set(id, { volume: saved?.volume_preferencial ?? 100, filter: 'reset' });
        }
        return { guildId: id, revision: this.revisions.get(id) || 0, queue: await this.queue.getQueue(id),
            current: this.getCurrentTrack(id), playerState: this.getPlayerState(id), playbackError: this.lastErrors.get(id) || null, settings: this.options.get(id) || { volume: 100, filter: 'reset' } };
    }
    node() { return this.shoukaku.options.nodeResolver(this.shoukaku.nodes); }
    async ensurePlayer(id, channelId, textChannelId) {
        let player = this.shoukaku.players.get(id);
        if (player && !this.voiceClosed.has(id)) return player;
        if (!channelId) fail('Join a voice channel to reconnect playback', 403);
        if (!this.node()) fail('Audio engine unavailable; queue retained', 503);
        const current = this.currentTracks.get(id);
        const state = this.getPlayerState(id);
        await this.shoukaku.leaveVoiceChannel(id);
        player = await this.shoukaku.joinVoiceChannel({ guildId: id, channelId, shardId: this.client.guilds?.cache.get(id)?.shardId || 0 });
        this.setupPlayerEvents(player, id, textChannelId);
        if (!this.options.has(id)) {
            const saved = await this.database.getGuildSettings(id);
            this.options.set(id, { volume: saved?.volume_preferencial ?? 100, filter: 'reset' });
        }
        await player.setGlobalVolume(this.options.get(id).volume);
        const preset = this.options.get(id).filter;
        if (preset !== 'reset') await player.setFilters(FILTERS[preset]);
        if (current && !current.terminal) {
            await player.playTrack({ track: { encoded: current.encoded, userData: { playbackToken: current.playbackToken } },
                userData: { playbackToken: current.playbackToken }, position: state?.position || 0, paused: state?.paused || false });
            Object.assign(this.playerStates.get(id), { connected: true, timestamp: Date.now() });
        }
        this.voiceClosed.delete(id);
        this.changed(id);
        return player;
    }
    buildSearch(raw, source = 'ytsearch') {
        const query = raw.trim().replace(/^url:/, '');
        if (/^https?:\/\//i.test(query)) {
            const url = new URL(query);
            if (url.hostname === 'music.youtube.com') url.hostname = 'www.youtube.com';
            if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com' || url.hostname === 'youtu.be') url.searchParams.delete('si');
            return url.toString();
        }
        return source + ':' + query;
    }
    extract(result) {
        if (result?.loadType === 'track') return [result.data];
        if (result?.loadType === 'playlist') return result.data.tracks || [];
        if (result?.loadType === 'search') return result.data.length ? [result.data[0]] : [];
        return [];
    }
    async resolve(node, raw, fallback) {
        const started = Date.now();
        const queries = [this.buildSearch(raw)];
        if (fallback) queries.push('ytsearch:' + fallback, 'ytmsearch:' + fallback);
        else if (!/^https?:\/\//i.test(raw.replace(/^url:/, ''))) queries.push('ytmsearch:' + raw);
        // One overall deadline covers all attempts; transport errors retain the queue entry.
        const result = await deadline(async () => {
            for (const query of queries) {
                const response = await node.rest.resolve(query);
                if (response?.loadType === 'error') {
                    log.warn('Source resolve error', { query, message: response.data?.message });
                    continue;
                }
                const tracks = this.extract(response);
                if (tracks.length) return { tracks, playlistName: response.loadType === 'playlist' ? response.data.info.name : null };
            }
            return { tracks: [], playlistName: null };
        }, this.timeout);
        log.debug('Resolution completed', { milliseconds: Date.now() - started, count: result.tracks.length });
        return result;
    }
    async enqueue(id, channelId, user, raw, textChannelId) {
        if (!channelId) fail('Join a voice channel first', 403);
        text(raw, 2000, 'Query');
        const generation = this.generation(id);
        const node = this.node();
        if (!node) fail('Audio engine unavailable; please retry', 503);
        const flags = { shuffle: false, reverse: false };
        const cleaned = raw.replace(/(?:\s+--?(?:s|r|shuffle|reverse))+\s*$/, match => {
            flags.shuffle = /--?(?:s|shuffle)(?:\s|$)/.test(match);
            flags.reverse = /--?(?:r|reverse)(?:\s|$)/.test(match);
            return '';
        });
        const tracks = [];
        const playlistNames = [];
        for (const part of cleaned.split(/\s*&&\s*/).map(p => p.trim()).filter(Boolean)) {
            let resolved;
            if (this.extractor.isPlaylistUrl(part) && !part.includes('open.spotify.com')) {
                try {
                    const result = await this.extractor.extractPlaylist(part);
                    if (!result.tracks.length) throw new Error('Playlist extraction returned no tracks');
                    resolved = { tracks: result.tracks.map(t => ({ url: t.url, info: { title: t.title, uri: t.url, length: t.duration, author: t.author || 'Unknown' } })), playlistName: result.playlistName };
                } catch (error) { log.warn('Playlist extractor failed; trying audio engine', error.message); resolved = await this.resolve(node, part); }
            } else resolved = await this.resolve(node, part);
            if (resolved.playlistName) playlistNames.push(resolved.playlistName);
            tracks.push(...resolved.tracks.map(track => ({ ...track, requester: { id: user.id, username: user.username } })));
        }
        if (!tracks.length) return { type: 'empty', count: 0 };
        if (flags.shuffle) for (let i = tracks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tracks[i], tracks[j]] = [tracks[j], tracks[i]]; }
        if (flags.reverse) tracks.reverse();
        return this.serial.run(id, async () => {
            if (generation !== this.generation(id)) fail('Playback changed while resolving; please retry', 409);
            // Membership is refreshed after potentially slow playlist extraction.
            if (this.authorize) channelId = (await this.authorize(id, user.id, true)).channelId;
            await this.ensurePlayer(id, channelId, textChannelId);
            if (generation !== this.generation(id)) return { type: 'empty', count: 0 };
            await this.queue.add(id, tracks);
            this.lastErrors.delete(id);
            this.failureStreaks.set(id, 0);
            this.changed(id);
            if (!this.currentTracks.has(id)) await this.advance(id, generation);
            else void this.prefetchNext(id);
            return { type: tracks.length === 1 ? 'track' : 'playlist', count: tracks.length, track: tracks[0], playlistNames, flags };
        });
    }
    async enqueueTracks(id, channelId, user, tracks) {
        const generation = this.generation(id);
        return this.serial.run(id, async () => {
            if (this.authorize) channelId = (await this.authorize(id, user.id, true)).channelId;
            await this.ensurePlayer(id, channelId);
            if (generation !== this.generation(id)) fail('Playback changed; retry', 409);
            await this.queue.add(id, tracks.map(t => ({ ...t, requester: { id: user.id, username: user.username } })));
            this.lastErrors.delete(id);
            this.failureStreaks.set(id, 0);
            this.changed(id);
            if (!this.currentTracks.has(id)) await this.advance(id, generation);
            else void this.prefetchNext(id);
            return { count: tracks.length };
        });
    }
    async prefetchNext(id) {
        const generation = this.generation(id);
        try {
            const head = await this.queue.peek(id);
            if (!head?.id || !this.node()) return;
            const resolved = head.encoded ? head : { ...(await this.resolve(this.node(), head.url || head.info.uri, head.info.title)).tracks[0], requester: head.requester, id: head.id };
            if (resolved?.encoded && generation === this.generation(id) && (await this.queue.peek(id))?.id === head.id)
                this.prefetch.set(id, { id: head.id, track: resolved, generation });
        } catch (error) { log.debug('Prefetch deferred', error.message); }
    }
    matches(id, data) {
        const current = this.currentTracks.get(id);
        if (!current || current.terminal) return false;
        const token = data.track?.userData?.playbackToken;
        // Token-capable engines distinguish consecutive copies of the same song.
        if (token) return token === current.playbackToken;
        return Boolean(data.track?.encoded && data.track.encoded === current.encoded);
    }
    setupPlayerEvents(player, id, textChannelId) {
        const safe = operation => (...args) => { Promise.resolve().then(() => operation(...args)).catch(error => log.error('Player event failed', { guildId: id, message: error.message })); };
        player.on('start', safe(async data => {
            if (!this.matches(id, data)) return;
            const current = this.currentTracks.get(id);
            if (current.started) return;
            current.started = true;
            log.info('Track started', { guildId: id, entryId: current.id, token: current.playbackToken, title: current.info.title, textChannelId });
            await this.database.recordHistory(id, current.info.title, current.info.uri, current.requester?.id);
            this.changed(id);
            void this.prefetchNext(id);
        }));
        const terminal = (data, stuck = false) => {
            if (!this.matches(id, data) || ['replaced', 'stopped'].includes(data.reason)) return;
            const current = this.currentTracks.get(id);
            const state = this.getPlayerState(id);
            const generation = this.generation(id);
            current.terminal = true; // Claim the event before the asynchronous queue operation.
            const early = data.reason === 'finished' && !current.info.isStream && state?.duration > 0 && state.position < state.duration - Math.max(5000, state.duration * 0.05);
            const failed = stuck || data.reason === 'loadFailed' || early;
            const streak = failed ? (this.failureStreaks.get(id) || 0) + 1 : 0;
            this.failureStreaks.set(id, streak);
            if (early) this.diagnostics.earlyEndings++;
            log[early ? 'warn' : 'info']('Track ended', { guildId: id, entryId: current.id, reason: data.reason || 'stuck', position: state?.position, duration: state?.duration, early });
            void this.serial.run(id, async () => {
                if (generation !== this.generation(id)) return;
                if (stuck) await player.stopTrack();
                this.currentTracks.delete(id);
                this.playerStates.delete(id);
                if (streak >= 5) {
                    this.diagnostics.failures++;
                    this.changed(id);
                    this.emit('failure', { guildId: id, message: 'Five playback failures in a row. Remaining queue retained; use /resume to retry.' });
                    return;
                }
                await this.advance(id, generation);
            }).catch(error => log.error('Track transition failed', error.message));
        };
        player.on('end', terminal);
        player.on('stuck', data => terminal(data, true));
        player.on('exception', data => { this.diagnostics.failures++; log.error('Track exception', { guildId: id, message: data.exception?.message || data.message }); });
        player.on('update', data => {
            const state = this.playerStates.get(id);
            if (!state || this.currentTracks.get(id)?.terminal || !data.state) return;
            state.position = data.state.position || 0;
            state.timestamp = Date.now();
            state.connected = data.state.connected !== false;
            if (state.position >= 5000) this.failureStreaks.set(id, 0);
            this.changed(id);
        });
        player.on('closed', data => {
            this.invalidate(id);
            this.voiceClosed.add(id);
            const state = this.playerStates.get(id);
            if (state) { state.position = this.getPlayerState(id).position; state.connected = false; state.timestamp = Date.now(); }
            log.warn('Voice connection closed; preserving queue', { guildId: id, code: data.code, reason: data.reason });
            this.changed(id);
        });
        player.on('resumed', () => {
            const state = this.playerStates.get(id);
            if (state) { state.connected = true; state.paused = player.paused; state.timestamp = Date.now(); }
            this.changed(id);
        });
    }
    async advance(id, generation = this.generation(id)) {
        const player = this.shoukaku.players.get(id);
        if (!player) return;
        for (let failures = 0; failures < 5; failures++) {
            if (generation !== this.generation(id)) return;
            const node = this.node();
            if (!node) { this.changed(id); return; }
            const head = await this.queue.peek(id);
            if (!head) { this.currentTracks.delete(id); this.playerStates.delete(id); this.changed(id); return; }
            let track = head;
            const prefetched = this.prefetch.get(id);
            this.prefetch.delete(id);
            try {
                if (prefetched?.id === head.id && prefetched.generation === generation) track = prefetched.track;
                else if (!head.encoded) {
                    const resolved = await this.resolve(node, head.url || head.info.uri, head.info.title);
                    if (generation !== this.generation(id)) return;
                    if (!resolved.tracks.length) {
                        await this.queue.next(id, head);
                        this.diagnostics.failures++;
                        log.warn('Unresolvable track skipped', { guildId: id, entryId: head.id, title: head.info.title });
                        continue;
                    }
                    track = { ...resolved.tracks[0], id: head.id, requester: head.requester };
                }
                if (generation !== this.generation(id) || !this.node()) return;
                if (!await this.queue.next(id, head)) continue;
                const token = randomUUID();
                this.currentTracks.set(id, { ...track, playbackToken: token });
                this.playerStates.set(id, { position: 0, timestamp: Date.now(), duration: track.info.length || 0, paused: false, connected: true });
                // NodeLink 2.x reads top-level userData after checking track.userData.
                // Supply both forms; Lavalink uses the nested, standard form.
                try { await player.playTrack({ track: { encoded: track.encoded, userData: { playbackToken: token } }, userData: { playbackToken: token } }); }
                catch (error) {
                    await this.queue.client.lPush('queue:' + id, JSON.stringify(head));
                    this.currentTracks.delete(id);
                    this.playerStates.delete(id);
                    throw error;
                }
                this.changed(id);
                return;
            } catch (error) {
                log.warn('Playback deferred; queue entry retained', { guildId: id, entryId: head.id, message: error.message });
                this.lastErrors.set(id, 'Audio request failed; queue retained. Use Resume to retry.');
                this.changed(id);
                return;
            }
        }
        this.currentTracks.delete(id);
        this.playerStates.delete(id);
        this.diagnostics.failures++;
        this.changed(id);
        this.emit('failure', { guildId: id, message: 'Five consecutive tracks could not resolve. Queue retained; use /resume to retry.' });
    }
    async playNext(id) { return this.serial.run(id, () => this.advance(id)); }
    async skip(id) {
        this.invalidate(id);
        return this.serial.run(id, async () => {
            const player = this.shoukaku.players.get(id);
            if (!player) return false;
            this.failureStreaks.set(id, 0);
            this.lastErrors.delete(id);
            this.currentTracks.delete(id);
            this.playerStates.delete(id);
            if (player.track) await player.stopTrack();
            await this.advance(id);
            this.changed(id);
            return true;
        });
    }
    async stop(id) {
        this.invalidate(id); // Cancels pending resolves immediately, before waiting for the lock.
        return this.serial.run(id, async () => {
            await this.queue.clear(id);
            this.failureStreaks.delete(id);
            this.lastErrors.delete(id);
            this.currentTracks.delete(id);
            this.playerStates.delete(id);
            const player = this.shoukaku.players.get(id);
            this.voiceClosed.delete(id);
            try { if (player?.track) await player.stopTrack(); }
            finally { await this.shoukaku.leaveVoiceChannel(id); this.changed(id); }
            return true;
        });
    }
    async pause(id, paused = true, channelId) {
        return this.serial.run(id, async () => {
            const player = !paused && channelId ? await this.ensurePlayer(id, channelId) : this.shoukaku.players.get(id);
            if (!player) return false;
            if (!paused && !this.currentTracks.has(id)) { this.lastErrors.delete(id); this.failureStreaks.set(id, 0); await this.advance(id); return true; }
            const state = this.playerStates.get(id);
            const position = this.getPlayerState(id)?.position || 0;
            await player.setPaused(paused);
            if (state) Object.assign(state, { position, paused, timestamp: Date.now() });
            this.changed(id);
            return true;
        });
    }
    async editQueue(id, action, from, to) {
        if (action === 'jump') this.invalidate(id);
        return this.serial.run(id, async () => {
            this.prefetch.delete(id);
            if (action === 'clear') await this.queue.clear(id);
            else await this.queue.edit(id, action, from, to);
            if (action === 'jump') {
                this.currentTracks.delete(id); this.playerStates.delete(id);
                const player = this.shoukaku.players.get(id);
                if (player) { if (player.track) await player.stopTrack(); await this.advance(id); }
            }
            this.changed(id);
            if (action !== 'clear') void this.prefetchNext(id);
            return true;
        });
    }
    async volume(id, value) {
        integer(value, 0, 100, 'Volume');
        return this.serial.run(id, async () => {
            const player = this.shoukaku.players.get(id);
            if (player) await player.update({ volume: value, paused: this.playerStates.get(id)?.paused || false }, true);
            await this.database.upsertGuildSettings(id, { volume: value });
            this.options.set(id, { ...(this.options.get(id) || { filter: 'reset' }), volume: value });
            this.changed(id);
            return true;
        });
    }
    async filter(id, preset) {
        if (!Object.hasOwn(FILTERS, preset)) fail('Unknown filter');
        return this.serial.run(id, async () => {
            const player = this.shoukaku.players.get(id);
            if (!player) fail('Nothing is playing', 409);
            const position = this.getPlayerState(id)?.position;
            await player.update({ filters: { volume: 1, equalizer: [], karaoke: null, timescale: null, tremolo: null,
                vibrato: null, rotation: null, distortion: null, channelMix: null, lowPass: null, ...FILTERS[preset] },
                paused: this.playerStates.get(id)?.paused || false }, true);
            const state = this.playerStates.get(id);
            if (state && position !== undefined) Object.assign(state, { position, timestamp: Date.now() });
            this.options.set(id, { ...(this.options.get(id) || { volume: 100 }), filter: preset });
            this.changed(id);
            return true;
        });
    }
}
