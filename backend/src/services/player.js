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

        /** Per-guild lock to prevent concurrent playNext() calls */
        this._playLocks = new Map();

        /**
         * Prefetch cache: guildId → { encoded, info, requester, ... }
         * Holds the pre-resolved next track so transitions are instant.
         */
        this._prefetchCache = new Map();
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
     * Applies URL normalization via _buildSearch and, if the direct URL
     * returns nothing, falls back to a title-based ytsearch/ytmsearch.
     *
     * @param {object} node - Lavalink node
     * @param {string} url - Track URL to resolve
     * @param {string|null} fallbackTitle - Track title for search fallback
     * @param {number} timeoutMs - Timeout in ms
     * @returns {Promise<object>} Lavalink resolve result
     */
    async _resolveWithTimeout(node, url, fallbackTitle = null, timeoutMs = JIT_RESOLVE_TIMEOUT) {
        // Normalise the URL (strip tracking params, convert music.youtube.com, etc.)
        const normalised = this._buildSearch(url, 'ytsearch');
        log.debug(`JIT resolve URL: raw="${url}" → normalised="${normalised}"`);

        const withTimeout = (promise) => Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`JIT resolution timed out after ${timeoutMs}ms`)), timeoutMs)
            ),
        ]);

        // Attempt 1: direct URL resolve
        let result = await withTimeout(node.rest.resolve(normalised));
        log.debug(`JIT resolve attempt 1 (direct): loadType=${result?.loadType}`);

        if (this._extractTracks(result).length > 0) return result;

        // Attempt 2: ytsearch by title (if we have a title)
        if (fallbackTitle) {
            log.debug(`JIT direct URL empty — fallback ytsearch: "${fallbackTitle}"`);
            result = await withTimeout(node.rest.resolve(`ytsearch:${fallbackTitle}`));
            log.debug(`JIT resolve attempt 2 (ytsearch): loadType=${result?.loadType}`);

            if (this._extractTracks(result).length > 0) return result;

            // Attempt 3: ytmsearch by title
            log.debug(`JIT ytsearch empty — fallback ytmsearch: "${fallbackTitle}"`);
            result = await withTimeout(node.rest.resolve(`ytmsearch:${fallbackTitle}`));
            log.debug(`JIT resolve attempt 3 (ytmsearch): loadType=${result?.loadType}`);
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

    /**
     * Format a duration in ms to a human-readable string (e.g. "3m 24s").
     */
    _formatDuration(ms) {
        if (!ms || ms <= 0) return '??:??';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    }

    // ── Prefetch ──────────────────────────────────────────────────────────────

    /**
     * Pre-resolve the next track in the queue so it's ready for instant playback.
     * Runs in the background — failures are silently swallowed (playNext handles them).
     */
    async _prefetchNext(guildId) {
        try {
            const peeked = await QueueService.peek(guildId);
            if (!peeked) {
                this._prefetchCache.delete(guildId);
                return;
            }

            // Already has an encoded string — no resolution needed
            if (peeked.encoded) {
                this._prefetchCache.set(guildId, peeked);
                log.debug(`[${guildId}] Prefetch: "${peeked.info?.title}" already encoded`);
                return;
            }

            const trackUrl = peeked.url || peeked.info?.uri;
            if (!trackUrl) {
                this._prefetchCache.delete(guildId);
                return;
            }

            const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
            if (!node) {
                this._prefetchCache.delete(guildId);
                return;
            }

            const fallbackTitle = peeked.info?.title || null;
            log.debug(`[${guildId}] Prefetch: resolving "${fallbackTitle || trackUrl}"...`);
            const startMs = Date.now();
            const result = await this._resolveWithTimeout(node, trackUrl, fallbackTitle);
            const resolved = this._extractTracks(result);

            if (resolved.length > 0) {
                const prefetched = { ...resolved[0], requester: peeked.requester };
                this._prefetchCache.set(guildId, prefetched);
                log.info(`[${guildId}] Prefetch: ✅ "${prefetched.info?.title}" ready (${Date.now() - startMs}ms)`);
            } else {
                this._prefetchCache.delete(guildId);
                log.debug(`[${guildId}] Prefetch: ⚠ No results for "${peeked.info?.title || trackUrl}"`);
            }
        } catch (err) {
            this._prefetchCache.delete(guildId);
            log.debug(`[${guildId}] Prefetch: failed (non-critical) — ${err.message}`);
        }
    }

    // ── Main play handler ───────────────────────────────────────────────────────

    async handlePlay(interaction, rawQuery, source = 'ytsearch') {
        const guildId = interaction.guildId;
        const channelId = interaction.member.voice.channelId;
        const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);

        if (!channelId) throw new Error('You need to be in a voice channel');
        if (!node) throw new Error('No audio nodes available');

        log.info(`[${guildId}] /play by ${interaction.user.tag}: "${rawQuery}"`);

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
                    log.info(`[${guildId}] yt-dlp: extracted ${tracks.length} tracks from "${playlistName}"`);
                } catch (err) {
                    log.warn(`[${guildId}] yt-dlp failed for ${part}, falling back to Lavalink:`, err.message);
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

        if (allTracks.length === 0) {
            log.warn(`[${guildId}] /play resolved 0 tracks for: "${rawQuery}"`);
            return { type: 'empty' };
        }

        // 4. Apply flags to the merged track list
        if (flags.shuffle) {
            for (let i = allTracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allTracks[i], allTracks[j]] = [allTracks[j], allTracks[i]];
            }
        }
        if (flags.reverse) allTracks.reverse();

        // 5. Add all tracks to the Redis queue in one shot
        const queueLen = await QueueService.add(guildId, allTracks);
        log.info(`[${guildId}] Queued ${allTracks.length} track(s) (queue size: ${queueLen})`);

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
                log.info(`[${guildId}] Joined voice channel ${channelId}`);
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
            const track = this.currentTracks.get(guildId);
            const title = track?.info?.title || 'Unknown';
            const uri = track?.info?.uri || 'N/A';
            const duration = this._formatDuration(track?.info?.length);
            const requester = track?.requester?.username || 'System';

            log.info(`[${guildId}] ▶ TRACK START: "${title}" [${duration}] | URI: ${uri} | Requested by: ${requester}`);

            this.emit('trackStart', { guildId, textChannelId, track: data.track });

            // Reset player state for new track
            const durationMs = track?.info?.length || 0;
            this.playerStates.set(guildId, {
                position: 0,
                timestamp: Date.now(),
                paused: false,
                duration: durationMs,
            });

            // Record to PostgreSQL history
            if (track?.info) {
                DatabaseService.recordHistory(
                    guildId,
                    track.info.title,
                    track.info.uri,
                    track.requester?.id || null
                );
            }

            // Kick off prefetch for the next track while this one plays
            this._prefetchNext(guildId).catch(() => { /* non-critical */ });
        });

        player.on('end', async (data) => {
            const track = this.currentTracks.get(guildId);
            const title = track?.info?.title || 'Unknown';
            const state = this.playerStates.get(guildId);
            const playedFor = state ? this._formatDuration(state.position + (state.paused ? 0 : Date.now() - state.timestamp)) : '??';
            const duration = this._formatDuration(track?.info?.length);

            log.info(`[${guildId}] ⏹ TRACK END: "${title}" | reason=${data.reason} | played=${playedFor}/${duration}`);

            // 'replaced' = another track was loaded directly (not a skip/stop)
            // 'stopped' = explicit stopTrack() call — skip() and stop() handle their own flow
            if (data.reason === 'replaced' || data.reason === 'stopped') {
                log.debug(`[${guildId}] End reason "${data.reason}" — not auto-advancing`);
                return;
            }

            if (data.reason === 'loadFailed') {
                log.warn(`[${guildId}] ⚠ TRACK LOAD FAILED: "${title}" — auto-skipping to next`);
            }

            // Natural end ('finished') or loadFailed — advance to next track
            await this.playNext(guildId);
        });

        player.on('stuck', async (data) => {
            const track = this.currentTracks.get(guildId);
            const title = track?.info?.title || 'Unknown';
            const uri = track?.info?.uri || 'N/A';

            log.warn(`[${guildId}] ⚠ TRACK STUCK: "${title}" (threshold: ${data.thresholdMs}ms) | URI: ${uri}`);

            // Stop the stuck track and advance directly
            try {
                player.stopTrack();
            } catch (err) {
                log.error(`[${guildId}] Error stopping stuck track:`, err.message);
            }
            // Advance explicitly — 'stopped' end events are filtered out
            await this.playNext(guildId);
        });

        player.on('exception', (data) => {
            const track = this.currentTracks.get(guildId);
            const title = track?.info?.title || 'Unknown';
            const uri = track?.info?.uri || 'N/A';
            const errMsg = data.message || data.exception || JSON.stringify(data);

            log.error(`[${guildId}] 💥 TRACK EXCEPTION: "${title}" | URI: ${uri} | Error: ${errMsg}`);
        });

        player.on('closed', (data) => {
            const code = data?.code ?? data;
            const reason = data?.reason ?? '';
            log.warn(`[${guildId}] 🔌 WebSocket closed — code=${code} reason="${reason}"`);

            // Only clear queue on intentional disconnects
            // 4014 = disconnected by Discord (kicked/moved)
            // 1000 = normal closure (we called stop/leave)
            if (code === 4014 || code === 1000) {
                log.info(`[${guildId}] Intentional disconnect (code=${code}), clearing queue & prefetch`);
                QueueService.clear(guildId);
                this.currentTracks.delete(guildId);
                this.playerStates.delete(guildId);
                this._prefetchCache.delete(guildId);
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
            log.info(`[${guildId}] 🔄 Player RESUMED after reconnect`);
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
     * Protected by a per-guild lock to prevent concurrent calls from racing.
     */
    async playNext(guildId) {
        if (this._playLocks.get(guildId)) {
            log.debug(`[${guildId}] playNext already in progress — skipping duplicate call`);
            return;
        }
        this._playLocks.set(guildId, true);

        try {
            await this._playNextInner(guildId);
        } finally {
            this._playLocks.delete(guildId);
        }
    }

    /**
     * Inner playNext logic — called only from the locked wrapper.
     * Uses an iterative approach with a skip counter to prevent stack overflow
     * when multiple consecutive tracks fail to resolve.
     */
    async _playNextInner(guildId) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return;

        let consecutiveFailures = 0;

        while (consecutiveFailures < MAX_SKIP_RETRIES) {
            // ── Check prefetch cache first ──
            const prefetched = this._prefetchCache.get(guildId);
            this._prefetchCache.delete(guildId);

            let nextTrack;
            let trackToPlay;

            if (prefetched) {
                // Pop the track from the queue (it was only peeked during prefetch)
                const popped = await QueueService.next(guildId);
                if (!popped) {
                    // Queue was cleared between prefetch and now
                    log.info(`[${guildId}] Queue empty (prefetch stale), stopping player`);
                    this.currentTracks.delete(guildId);
                    this.playerStates.delete(guildId);
                    player.stopTrack();
                    return;
                }
                trackToPlay = prefetched;
                log.debug(`[${guildId}] Using prefetched track: "${prefetched.info?.title}"`);
            } else {
                // No prefetch — pop and resolve normally
                nextTrack = await QueueService.next(guildId);

                if (!nextTrack) {
                    log.info(`[${guildId}] 📭 Queue empty, stopping player`);
                    this.currentTracks.delete(guildId);
                    this.playerStates.delete(guildId);
                    player.stopTrack();
                    return;
                }

                // ── Just-in-time resolution for yt-dlp stubs ──
                trackToPlay = nextTrack;

                if (!nextTrack.encoded) {
                    const trackUrl = nextTrack.url || nextTrack.info?.uri;
                    if (!trackUrl) {
                        log.error(`[${guildId}] Track has no encoded string and no URL — skipping: ${JSON.stringify(nextTrack.info || {})}`);
                        consecutiveFailures++;
                        continue;
                    }

                    const fallbackTitle = nextTrack.info?.title || null;
                    log.info(`[${guildId}] 🔍 JIT resolving: "${fallbackTitle || trackUrl}" | URL: ${trackUrl}`);
                    const resolveStart = Date.now();
                    const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
                    if (!node) {
                        log.error(`[${guildId}] No Lavalink node available for JIT resolution — stopping`);
                        return; // No node = can't play anything, don't loop
                    }

                    try {
                        const result = await this._resolveWithTimeout(node, trackUrl, fallbackTitle);
                        const resolved = this._extractTracks(result);
                        if (resolved.length === 0) {
                            log.warn(`[${guildId}] JIT resolution returned 0 tracks for: "${fallbackTitle || trackUrl}" | URL: ${trackUrl} | loadType: ${result?.loadType} (${Date.now() - resolveStart}ms)`);
                            consecutiveFailures++;
                            continue;
                        }
                        // Merge resolved Lavalink data with our metadata (keep requester, etc.)
                        trackToPlay = { ...resolved[0], requester: nextTrack.requester };
                        log.info(`[${guildId}] ✅ JIT resolved: "${trackToPlay.info?.title}" in ${Date.now() - resolveStart}ms`);
                    } catch (err) {
                        log.warn(`[${guildId}] JIT resolution failed for "${nextTrack.info?.title || trackUrl}": ${err.message}`);
                        consecutiveFailures++;
                        continue;
                    }
                }
            }

            // ── Play the track ──
            this.currentTracks.set(guildId, trackToPlay);
            log.info(`[${guildId}] ▶ Playing: "${trackToPlay.info?.title || 'Unknown'}" [${this._formatDuration(trackToPlay.info?.length)}]`);

            try {
                await player.playTrack({ track: { encoded: trackToPlay.encoded } });
                return; // Success — exit the loop
            } catch (error) {
                log.error(`[${guildId}] 💥 PLAY FAILED: "${trackToPlay.info?.title}" — ${error.message}`);
                consecutiveFailures++;
                continue;
            }
        }

        // Exhausted retries
        log.error(`[${guildId}] ❌ Max consecutive failures (${MAX_SKIP_RETRIES}) reached — stopping player`);
        this.currentTracks.delete(guildId);
        this.playerStates.delete(guildId);
        this._prefetchCache.delete(guildId);
        player.stopTrack();
    }

    async skip(guildId) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return false;

        const track = this.currentTracks.get(guildId);
        log.info(`[${guildId}] ⏭ SKIP requested: "${track?.info?.title || 'Unknown'}"`);

        // Stop current track, then explicitly advance
        // ('stopped' end events are filtered, so we must call playNext ourselves)
        await player.stopTrack();
        await this.playNext(guildId);
        return true;
    }

    async stop(guildId) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return false;

        const track = this.currentTracks.get(guildId);
        log.info(`[${guildId}] ⏹ STOP requested: "${track?.info?.title || 'Unknown'}" — clearing queue & leaving`);

        await QueueService.clear(guildId);
        this.currentTracks.delete(guildId);
        this.playerStates.delete(guildId);
        this._prefetchCache.delete(guildId);
        await player.stopTrack();
        this.shoukaku.leaveVoiceChannel(guildId);
        return true;
    }

    async pause(guildId, state = true) {
        const player = this.shoukaku.players.get(guildId);
        if (!player) return false;
        await player.setPaused(state);

        const track = this.currentTracks.get(guildId);
        log.info(`[${guildId}] ${state ? '⏸ PAUSED' : '▶ RESUMED'}: "${track?.info?.title || 'Unknown'}"`);

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
