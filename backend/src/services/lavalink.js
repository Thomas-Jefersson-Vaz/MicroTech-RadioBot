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
        this.shoukaku.on('close', (name, code, reason) => console.warn(`Lavalink Node ${name} closed: ${code} ${reason}`));
        this.shoukaku.on('reconnecting', (name, attempts, interval) => console.log(`[Lavalink] Reconnecting to Node ${name}... Attempts: ${attempts}`));
    }
}

export default LavalinkManager;
