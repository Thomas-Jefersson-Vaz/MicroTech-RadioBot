import { Shoukaku, Connectors } from 'shoukaku';
import { config } from '../config/env.js';
import createLogger from '../utils/logger.js';

const log = createLogger('Lavalink');

// Shoukaku State enum values (numeric)
const State = {
    CONNECTING: 0,
    CONNECTED: 1,
    DISCONNECTING: 2,
    DISCONNECTED: 3,
};

class LavalinkManager {
    constructor(client) {
        this.client = client;

        log.info('Connecting to nodes:', JSON.stringify(
            config.lavalink.nodes.map(n => ({ name: n.name, url: n.url, auth: n.auth ? '***' : null }))
        ));

        const shoukakuOptions = {
            // ── Reconnection ──
            reconnectTries: 30,           // 30 attempts (~150 seconds) before giving up
            reconnectInterval: 5000,      // 5 seconds between attempts

            // ── Session Resume ──
            resume: true,                 // Server-side resume (NOTE: does NOT survive Lavalink server restarts)
            resumeTimeout: 120,           // 2 minutes for Lavalink to hold the session
            resumeByLibrary: true,        // Client-side resume — tries to restore players regardless of what happened to Lavalink

            // ── Reliability ──
            moveOnDisconnect: false,      // Only 1 node for now; enable when adding more
            restTimeout: 30000,           // 30s timeout for REST calls (prevents hanging JIT resolution)
            voiceConnectionTimeout: 15000, // 15s timeout for voice channel joins
        };

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.lavalink.nodes, shoukakuOptions);

        // ── Node lifecycle events ──

        this.shoukaku.on('ready', (name, lavalinkResume, libraryResume) => {
            log.info(`Node "${name}" is ready (lavalinkResume=${lavalinkResume}, libraryResume=${libraryResume})`);
        });

        this.shoukaku.on('error', (name, error) => {
            log.error(`Node "${name}" error:`, error.message || error);
        });

        this.shoukaku.on('close', (name, code, reason) => {
            log.warn(`Node "${name}" connection closed — code=${code} reason="${reason || 'none'}"`);
        });

        this.shoukaku.on('disconnect', (name, count) => {
            log.warn(`Node "${name}" disconnected — ${count} reconnect attempts remaining`);

            if (count <= 0) {
                log.error(`Node "${name}" exhausted all reconnect attempts. Scheduling manual recovery...`);
                // After Shoukaku gives up, try one more time after a longer delay
                setTimeout(() => {
                    const node = this.shoukaku.nodes.get(name);
                    if (node && node.state === State.DISCONNECTED) {
                        log.info(`Node "${name}" manual recovery: attempting reconnect...`);
                        try {
                            node.connect();
                        } catch (err) {
                            log.error(`Node "${name}" manual reconnect failed:`, err.message);
                        }
                    }
                }, 15000);
            }
        });

        this.shoukaku.on('reconnecting', (name, reconnectsLeft, interval) => {
            log.info(`Reconnecting to node "${name}" — ${reconnectsLeft} attempts left (interval: ${interval}ms)`);
        });

        this.shoukaku.on('debug', (name, info) => {
            log.debug(`Node "${name}":`, info);
        });

        // ── Health check ──
        // Periodic safety net: if a node is stuck in DISCONNECTED state and Shoukaku
        // isn't actively reconnecting (e.g. after exhausting retries), force a reconnect.
        this.healthCheckTimer = setInterval(() => {
            for (const nodeConfig of config.lavalink.nodes) {
                const node = this.shoukaku.nodes.get(nodeConfig.name);
                if (node && node.state === State.DISCONNECTED) {
                    log.warn(`Health check: node "${nodeConfig.name}" is DISCONNECTED (state=${node.state}). Force-reconnecting...`);
                    try {
                        node.connect();
                    } catch (err) {
                        log.error(`Health check reconnect to "${nodeConfig.name}" failed:`, err.message);
                    }
                }
            }
        }, 30000); // Check every 30s (reduced from 10s to avoid spamming during normal reconnect cycles)
    }

    /**
     * Get a connected node, or null if none available.
     */
    getNode() {
        return this.shoukaku.options.nodeResolver(this.shoukaku.nodes) || null;
    }

    /**
     * Gracefully destroy the manager.
     * Disconnects all players and clears timers.
     */
    async destroy() {
        log.info('Destroying Lavalink manager...');

        // Clear health check
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        // Disconnect all players
        const playerGuildIds = [...this.shoukaku.players.keys()];
        for (const guildId of playerGuildIds) {
            try {
                this.shoukaku.leaveVoiceChannel(guildId);
            } catch (err) {
                log.warn(`Error disconnecting player for guild ${guildId}:`, err.message);
            }
        }

        // Disconnect all nodes
        for (const [name, node] of this.shoukaku.nodes) {
            try {
                node.disconnect();
                log.debug(`Disconnected node "${name}"`);
            } catch (err) {
                log.warn(`Error disconnecting node "${name}":`, err.message);
            }
        }

        log.info('Lavalink manager destroyed');
    }
}

export default LavalinkManager;
