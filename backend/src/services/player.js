import QueueService from './queue.js';
import DatabaseService from './database.js';
import YtdlpService from './ytdlp.js';
import { EventEmitter } from 'events';
import createLogger from '../utils/logger.js';

const log = createLogger('Player');

/**
 * Maximum consecutive track failures before playNext() gives up.
 * Prevents infinite loops when an entire queue is unresolvable.
 */
const MAX_SKIP_RETRIES = 5;

/**
 * Timeout for JIT track resolution via Lavalink REST (ms).
 * Prevents a single hung resolve from blocking the entire player.
 */
const JIT_RESOLVE_TIMEOUT = 15000;

class PlayerController extends EventEmitter {
    constructor(client, lavalink) {
        super();
        this.client = client;
        this.lavalink = lavalink;
        this.shoukaku = lavalink.shoukaku;

        this.currentTracks = new Map();
        this.playerStates = new Map(); // { position, timestamp, paused, duration }
    }

    getCurrentTrack(guildId) {
        return this.currentTracks.get(guildId) || null;
    }

    /**
     * Get the current player state with interpolated position.
     * Position is estimated between Lavalink update intervals for smooth progress.
     */
    getPlayerState(guildId) {
        const state = this.playerStates.get(guildId);
        if (!state) return null;

        // Interpolate position based on elapsed time since last update
        let position = state.position;
        if (!state.paused && state.timestamp) {
            const elapsed = Date.now() - state.timestamp;
            position = Math.min(state.position + elapsed, state.duration || Infinity);
        }

        return {
            position: Math.floor(position),
            duration: state.duration || 0,
            paused: state.paused || false,
        };
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Strip & return trailing flags (-s, -r, --shuffle …) from a raw query string.
     * Fixed to properly handle multiple flags (e.g. "-s -r").
     */
    _parseFlags(raw) {
        const flags = { shuffle: false, reverse: false };

        // Match all trailing flag tokens individually
        const cleaned = raw.replace(/(\s+-{1,2}\w+)+\s*$/, (match) => {
            // Split the matched portion into individual flags
            const tokens = match.trim().split(/\s+/);
            for (const token of tokens) {
                const flag = token.replace(/^-{1,2}/, '');
                if (flag === 's' || flag === 'shuffle') flags.shuffle = true;
                if (flag === 'r' || flag === 'reverse') flags.reverse = true;
            }
            return '';
        }).trim();

        return { cleaned, flags };
    }

    /** Normalise a single URL/term into a Lavalink-ready search string */
    _buildSearch(query, source) {
        query = query.trim();
        // Strip 'url:' prefix that Discord/some clients prepend to embedded URLs
        if (query.startsWith('url:')) query = query.slice(4);
        if (/^https?:\/\//.test(query)) {
            if (query.includes('music.youtube.com')) {
                return query
                    .replace('music.youtube.com', 'www.youtube.com')
                    .replace(/[?&]si=[^&]*/g, '')
                    .replace(/\?&/, '?').replace(/&$/, '').replace(/\?$/, '');
            }
            if (query.includes('youtube.com') || query.includes('youtu.be')) {
                return query
                    .replace(/[?&]si=[^&]*/g, '')
                    .replace(/\?&/, '?').replace(/&$/, '').replace(/\?$/, '');
            }
            return query; // other direct URLs pass through
        }
        return `${source}:${query}`;
    }

    /** Resolve a single search string via Lavalink, with ytmsearch fallback */
    async _resolve(node, rawQuery, source) {
        const isUrl = /^https?:\/\//.test(rawQuery.trim());
        const search = this._buildSearch(rawQuery, source);
        log.debug(`Resolving: ${search}`);
        let result = await node.rest.resolve(search);

        // Fallback to YouTube Music search when text search returns nothing
        if (!isUrl && (!result || result.loadType === 'empty' || result.loadType === 'error')) {
            log.debug(`ytsearch empty — retrying with ytmsearch: ${rawQuery.trim()}`);
            result = await node.rest.resolve(`ytmsearch:${rawQuery.trim()}`);
        }
        return result;
    }

    /**
     * Resolve a track URL with a timeout to prevent hanging.
     * Returns null on timeout instead of blocking forever.
     */
    async _resolveWithTimeout(node, url, timeoutMs = JIT_RESOLVE_TIMEOUT) {
        const resolvePromise = node.rest.resolve(url);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`JIT resolution timed out after ${timeoutMs}ms`)), timeoutMs)
        );
        return Promise.race([resolvePromise, timeoutPromise]);
    }

    /** Extract tracks array from a Lavalink result object */
    _extractTracks(result) {
        if (!result || result.loadType === 'empty' || result.loadType === 'error') return [];
        if (result.loadType === 'playlist') return result.data.tracks;
        if (result.loadType === 'track') return [result.data];
        if (result.loadType === 'search') return result.data.length ? [result.data[0]] : [];
        if (Array.isArray(result.data)) return result.data;
        return result.data ? [result.data] : [];
    }

    // ── Main play handler ───────────────────────────────────────────────────────

    async handlePlay(interaction, rawQuery, source = 'ytsearch') {
        const guildId = interaction.guildId;
        const channelId = interaction.member.voice.channelId;
        const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);

        if (!channelId) throw new Error('You need to be in a voice channel');
        if (!node) throw new Error('No audio nodes available');

        // 1. Parse flags from the end of the full query string
        const { cleaned: fullCleaned, flags } = this._parseFlags(rawQuery.trim());

        // 2. Split on ' && ' to support multiple URLs/terms in one command
        const parts = fullCleaned.split(/\s+&&\s+/).map(p => p.trim()).filter(Boolean);

        // 3. Resolve each part — use yt-dlp for playlist URLs, Lavalink for everything else
        let allTracks = [];
        let playlistNames = [];

        for (const part of parts) {
            if (YtdlpService.isPlaylistUrl(part)) {
                // ── yt-dlp path: extract full playlist metadata (no track limit) ──
                try {
                    const { tracks, playlistName } = await YtdlpService.extractPlaylist(part);
                    if (playlistName) playlistNames.push(playlistName);
                    const enriched = tracks.map(t => ({
                        // Lightweight stub — no `encoded` field, resolved just-in-time in playNext()
                        info: {
                            title: t.title,
                            uri: t.url,
                            length: t.duration,
                        },
                        url: t.url,
                        requester: { id: interaction.user.id, username: interaction.user.username },
                    }));
                    allTracks.push(...enriched);
                } catch (err) {
                    log.warn(`yt-dlp failed for ${part}, falling back to Lavalink:`, err.message);
                    // Fallback to Lavalink if yt-dlp fails
                    const result = await this._resolve(node, part, source);
                    if (result?.loadType === 'playlist') playlistNames.push(result.data.info.name);
                    const tracks = this._extractTracks(result).map(t => ({
                        ...t,
                        requester: { id: interaction.user.id, username: interaction.user.username }
                    }));
                    allTracks.push(...tracks);
                }
            } else {
                // ── Lavalink path: single track / search (unchanged) ──
                const result = await this._resolve(node, part, source);
                if (result?.loadType === 'playlist') playlistNames.push(result.data.info.name);
                const tracks = this._extractTracks(result).map(t => ({
                    ...t,
                    requester: { id: interaction.user.id, username: interaction.user.username }
                }));
                allTracks.push(...tracks);
            }
        }

        if (allTracks.length === 0) return { type: 'empty' };

        // 4. Apply flags to the merged track list
        if (flags.shuffle) {
            for (let i = allTracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allTracks[i], allTracks[j]] = [allTracks[j], allTracks[i]];
            }
        }
        if (flags.reverse) allTracks.reverse();

        // 5. Add all tracks to the Redis queue in one shot
        await QueueService.add(guildId, allTracks);

        // Check if player exists in this Shoukaku session
        let player = this.shoukaku.players.get(guildId);

        if (!player) {
            // Leave any stale Lavalink player from a previous bot session before joining
            try {
                await this.shoukaku.leaveVoiceChannel(guildId);
            } catch (_) { /* no stale player — that's fine */ }

            try {
                player = await this.shoukaku.joinVoiceChannel({
                    guildId: guildId,
                    channelId: channelId,
                    shardId: 0
                });
            } catch (err) {
                log.error(`[${guildId}] joinVoiceChannel failed:`, err.message);
                throw new Error('Could not connect to your voice channel. Make sure I have permission and you are in the server\'s voice channel.');
            }

            this.setupPlayerEvents(player, guildId, interaction.channelId);
            await this.playNext(guildId);
        }

        return {
            type: allTracks.length === 1 ? 'track' : 'playlist',
            count: allTracks.length,
            track: allTracks[0],
            playlistNames,
            flags
        };
    }

    setupPlayerEvents(player, guildId, textChannelId) {
        player.on('start', (data) => {
            log.info(`[${guildId}] Track started: ${this.currentTracks.get(guildId)?.info?.title || 'Unknown'}`);
            this.emit('trackStart', { guildId, textChannelId, track: data.track });

            // Reset player state for new track
            const currentTrack = this.currentTracks.get(guildId);
            const duration = currentTrack?.info?.length || 0;
            this.playerStates.set(guildId, {
                position: 0,
                timestamp: Date.now(),
                paused: false,
                duration,
            });

            // Record to PostgreSQL history
            if (currentTrack?.info) {
                DatabaseService.recordHistory(
                    guildId,
                    currentTrack.info.title,
                    currentTrack.info.uri,
                    currentTrack.requester?.id || null
                );
            }
        });

        player.on('end', async (data) => {
            log.info(`[${guildId}] Track ended: reason=${data.reason}`);
            if (data.reason === 'replaced') return;

            if (data.reason === 'loadFailed') {
                log.warn(`[${guildId}] Track load failed — skipping to next`);
            }

            // Play next track
            await this.playNext(guildId);
        });

        player.on('stuck', (data) => {
            log.warn(`[${guildId}] Track STUCK (threshold: ${data.thresholdMs}ms) — skipping to next`);
            // Force-stop the stuck track and move to the next one
            try {
                player.stopTrack();
            } catch (err) {
                log.error(`[${guildId}] Error stopping stuck track:`, err.message);
            }
            // playNext will be triggered by the 'end' event from stopTrack
        });

        player.on('exception', (data) => {
            log.error(`[${guildId}] Player exception:`, data.message || data.exception || data);
        });

        player.on('closed', (data) => {
            const code = data?.code ?? data;
            const reason = data?.reason ?? '';
            log.warn(`[${guildId}] WebSocket closed — code=${code} reason="${reason}"`);

            // Only clear queue on intentional disconnects
            // 4014 = disconnected by Discord (kicked/moved)
            // 1000 = normal closure (we called stop/leave)
            if (code === 4014 || code === 1000) {
                log.info(`[${guildId}] Intentional disconnect (code=${code}), clearing queue`);
                QueueService.clear(guildId);
                this.currentTracks.delete(guildId);
                this.playerStates.delete(guildId);
            } else {
                // Transient failure — keep queue intact for potential resume
                log.info(`[${guildId}] Transient disconnect (code=${code}), keeping queue for resume`);
                // Update state to reflect disconnected status
                const existing = this.playerStates.get(guildId);
                if (existing) {
                    existing.paused = true;
                    existing.timestamp = Date.now();
                    this.playerStates.set(guildId, existing);
                }
            }
        });

        player.on('resumed', () => {
            log.info(`[${guildId}] Player RESUMED after reconnect`);
            // Re-sync paused state from the actual player
            const existing = this.playerStates.get(guildId);
            if (existing) {
                existing.paused = player.paused;
                existing.timestamp = Date.now();
                this.playerStates.set(guildId, existing);
            }
        });

        player.on('update', (update) => {
            if (update.state) {
                // Store real position from Lavalink for progress tracking
                const existing = this.playerStates.get(guildId) || {};
                this.playerStates.set(guildId, {
                    ...existing,
                    position: update.state.position || 0,
                    timestamp: Date.now(),
                });
            }
        });
    }

    /**
     * Play the next track in the queue.
     * Uses an iterative approach with a skip counter to prevent stack overflow
     * when multiple consecutive tracks fail to resolve.
     */
    async playNext(guildId) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return;

        let consecutiveFailures = 0;

        while (consecutiveFailures < MAX_SKIP_RETRIES) {
            const nextTrack = await QueueService.next(guildId);

            if (!nextTrack) {
                log.info(`[${guildId}] Queue empty, stopping player`);
                this.currentTracks.delete(guildId);
                this.playerStates.delete(guildId);
                player.stopTrack();
                return;
            }

            // ── Just-in-time resolution for yt-dlp stubs ──
            let trackToPlay = nextTrack;

            if (!nextTrack.encoded) {
                const trackUrl = nextTrack.url || nextTrack.info?.uri;
                if (!trackUrl) {
                    log.error(`[${guildId}] Track has no encoded string and no URL — skipping`);
                    consecutiveFailures++;
                    continue;
                }

                log.debug(`[${guildId}] JIT resolving: ${nextTrack.info?.title || trackUrl}`);
                const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
                if (!node) {
                    log.error(`[${guildId}] No Lavalink node available for JIT resolution — stopping`);
                    return; // No node = can't play anything, don't loop
                }

                try {
                    const result = await this._resolveWithTimeout(node, trackUrl);
                    const resolved = this._extractTracks(result);
                    if (resolved.length === 0) {
                        log.warn(`[${guildId}] JIT resolution returned no tracks for: ${trackUrl}`);
                        consecutiveFailures++;
                        continue;
                    }
                    // Merge resolved Lavalink data with our metadata (keep requester, etc.)
                    trackToPlay = { ...resolved[0], requester: nextTrack.requester };
                } catch (err) {
                    log.warn(`[${guildId}] JIT resolution failed for "${nextTrack.info?.title || trackUrl}": ${err.message}`);
                    consecutiveFailures++;
                    continue;
                }
            }

            // ── Play the track ──
            this.currentTracks.set(guildId, trackToPlay);
            log.info(`[${guildId}] Playing: ${trackToPlay.info?.title || 'Unknown'}`);

            try {
                await player.playTrack({ track: { encoded: trackToPlay.encoded } });
                return; // Success — exit the loop
            } catch (error) {
                log.error(`[${guildId}] Failed to play track "${trackToPlay.info?.title}":`, error.message);
                consecutiveFailures++;
                continue;
            }
        }

        // Exhausted retries
        log.error(`[${guildId}] Max consecutive skip failures (${MAX_SKIP_RETRIES}) reached — stopping player`);
        this.currentTracks.delete(guildId);
        this.playerStates.delete(guildId);
        player.stopTrack();
    }

    async skip(guildId) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return false;
        await player.stopTrack();
        return true;
    }

    async stop(guildId) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return false;
        await QueueService.clear(guildId);
        this.currentTracks.delete(guildId);
        this.playerStates.delete(guildId);
        await player.stopTrack();
        this.shoukaku.leaveVoiceChannel(guildId);
        return true;
    }

    async pause(guildId, state = true) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return false;
        await player.setPaused(state);

        // Track paused state for progress interpolation
        const existing = this.playerStates.get(guildId);
        if (existing) {
            if (state) {
                // Pausing: freeze position at current interpolated value
                const elapsed = Date.now() - (existing.timestamp || Date.now());
                existing.position = Math.min(existing.position + elapsed, existing.duration || Infinity);
            }
            existing.paused = state;
            existing.timestamp = Date.now();
            this.playerStates.set(guildId, existing);
        }

        return true;
    }
}

export default PlayerController;
