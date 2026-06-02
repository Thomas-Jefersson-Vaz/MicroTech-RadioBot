import LavalinkManager from './lavalink.js';
import QueueService from './queue.js';
import DatabaseService from './database.js';
import YtdlpService from './ytdlp.js';
import { EventEmitter } from 'events';

class PlayerController extends EventEmitter {
    constructor(client, lavalink) {
        super();
        this.client = client;
        this.lavalink = lavalink; // This is the wrapper, we need the shoukaku instance

        // Listen to Shoukaku events via the wrapper if possible, or access instance directly
        this.shoukaku = lavalink.shoukaku;

        this.shoukaku.on('error', (_, error) => console.error('Shoukaku Error:', error));
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

    /** Strip & return trailing flags (-s, -r, --shuffle …) from a raw query string */
    _parseFlags(raw) {
        const flags = { shuffle: false, reverse: false };
        // Collect all trailing -x / --xxx tokens
        const cleaned = raw.replace(/(\s+-{1,2}(\w+))+\s*$/g, (_, _full, token) => {
            if (token === 's' || token === 'shuffle') flags.shuffle = true;
            if (token === 'r' || token === 'reverse') flags.reverse = true;
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
        console.log(`[Player] Resolving: ${search}`);
        let result = await node.rest.resolve(search);

        // Fallback to YouTube Music search when text search returns nothing
        if (!isUrl && (!result || result.loadType === 'empty' || result.loadType === 'error')) {
            console.log(`[Player] ytsearch empty — retrying with ytmsearch: ${rawQuery.trim()}`);
            result = await node.rest.resolve(`ytmsearch:${rawQuery.trim()}`);
        }
        return result;
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
                    console.warn(`[Player] yt-dlp failed for ${part}, falling back to Lavalink:`, err.message);
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
                console.error(`[Player:${guildId}] joinVoiceChannel failed:`, err);
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
            console.log(`[Player:${guildId}] Track Started`);
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
            console.log(`[Player:${guildId}] Track Ended: ${data.reason}`);
            if (data.reason === 'replaced') return;
            if (data.reason === 'loadFailed') console.warn('Track load failed');
            // Play next
            await this.playNext(guildId);
        });

        player.on('exception', (err) => {
            console.error(`[Player:${guildId}] Exception:`, err);
        });

        player.on('closed', () => {
            console.log(`[Player:${guildId}] Connection Closed`);
            QueueService.clear(guildId);
            this.playerStates.delete(guildId);
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

    async playNext(guildId) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return;

        const nextTrack = await QueueService.next(guildId);
        if (!nextTrack) {
            console.log(`[Player:${guildId}] Queue empty, stopping.`);
            this.currentTracks.delete(guildId);
            this.playerStates.delete(guildId);
            player.stopTrack();
            // Disconnect after timeout?
            // setTimeout(() => this.shoukaku.leaveVoiceChannel(guildId), 30000);
            return;
        }

        // ── Just-in-time resolution for yt-dlp stubs ──
        // Tracks from yt-dlp have no `encoded` field — resolve via Lavalink now
        let trackToPlay = nextTrack;

        if (!nextTrack.encoded) {
            const trackUrl = nextTrack.url || nextTrack.info?.uri;
            if (!trackUrl) {
                console.error(`[Player:${guildId}] Track has no encoded string and no URL:`, nextTrack);
                return this.playNext(guildId);
            }

            console.log(`[Player:${guildId}] JIT resolving: ${nextTrack.info?.title || trackUrl}`);
            const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
            if (!node) {
                console.error(`[Player:${guildId}] No Lavalink node available for JIT resolution`);
                return this.playNext(guildId);
            }

            try {
                const result = await node.rest.resolve(trackUrl);
                const resolved = this._extractTracks(result);
                if (resolved.length === 0) {
                    console.warn(`[Player:${guildId}] JIT resolution returned no tracks for: ${trackUrl}`);
                    return this.playNext(guildId); // skip unresolvable tracks
                }
                // Merge resolved Lavalink data with our metadata (keep requester, etc.)
                trackToPlay = { ...resolved[0], requester: nextTrack.requester };
            } catch (err) {
                console.warn(`[Player:${guildId}] JIT resolution failed for ${trackUrl}: ${err.message}`);
                return this.playNext(guildId); // skip failed tracks
            }
        }

        this.currentTracks.set(guildId, trackToPlay);

        console.log(`[Player:${guildId}] Playing next track:`, trackToPlay.info ? trackToPlay.info.title : 'Unknown');

        try {
            await player.playTrack({ track: { encoded: trackToPlay.encoded } });
        } catch (error) {
            console.error(`[Player:${guildId}] Failed to play track:`, error);
            // Try next one
            this.playNext(guildId);
        }
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
