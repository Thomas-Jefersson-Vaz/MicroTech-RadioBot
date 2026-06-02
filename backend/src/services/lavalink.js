import { Shoukaku, Connectors } from 'shoukaku';
import { config } from '../config/env.js';

class LavalinkManager {
    constructor(client) {
        this.client = client;
        console.log('[Lavalink] Connecting to nodes:', JSON.stringify(config.lavalink.nodes.map(n => ({ name: n.name, url: n.url, auth: n.auth ? '***' : null }))));
        
        const shoukakuOptions = {
            reconnectTries: 15, // Try 15 times (~75 seconds) before giving up
            reconnectInterval: 5000, // 5 seconds between attempts
            resume: true, // Resume session if disconnected
            resumeTimeout: 60 // Resume timeout of 60 seconds
        };

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.lavalink.nodes, shoukakuOptions);

        this.shoukaku.on('error', (_, error) => console.error('Lavalink Error:', error));
        this.shoukaku.on('ready', (name) => console.log(`Lavalink Node ${name} is ready`));
        this.shoukaku.on('close', (name, code, reason) => {
            console.warn(`Lavalink Node ${name} closed: ${code} ${reason}`);
            // If the node closed (e.g. with 1000 normal closure on handshake timeout), force a reconnect check
            console.log(`[Lavalink] Node ${name} disconnected. Checking connection status in 5 seconds...`);
            setTimeout(() => {
                const node = this.shoukaku.nodes.get(name);
                if (node && node.state !== 1 && node.state !== 'CONNECTED') {
                    console.log(`[Lavalink] Node ${name} is not connected (state: ${node.state}). Force-connecting...`);
                    try {
                        node.connect();
                    } catch (err) {
                        console.error(`[Lavalink] Connection retry failed: ${err.message}`);
                    }
                } else {
                    console.log(`[Lavalink] Node ${name} connection status: already connected or connecting.`);
                }
            }, 5000);
        });
        this.shoukaku.on('reconnecting', (name, attempts, interval) => console.log(`[Lavalink] Reconnecting to Node ${name}... Attempts: ${attempts}`));

        // Periodic health check every 10 seconds to ensure the bot recovers if Shoukaku gives up or misses events on startup
        this.healthCheckTimer = setInterval(() => {
            for (const nodeConfig of config.lavalink.nodes) {
                const node = this.shoukaku.nodes.get(nodeConfig.name);
                if (node) {
                    // Check if node is not connected (1 / 'CONNECTED') and not currently connecting (0 / 'CONNECTING')
                    if (node.state !== 1 && node.state !== 'CONNECTED' && node.state !== 0 && node.state !== 'CONNECTING') {
                        console.log(`[Lavalink] Health check: Node ${nodeConfig.name} is not connected (state: ${node.state}). Force-connecting...`);
                        try {
                            node.connect();
                        } catch (err) {
                            console.error(`[Lavalink] Health check connection to ${nodeConfig.name} failed:`, err.message);
                        }
                    }
                }
            }
        }, 10000);
    }
}

export default LavalinkManager;
