import { Shoukaku, Connectors } from 'shoukaku';
import { config } from '../config/env.js';

class LavalinkManager {
    constructor(client) {
        this.client = client;
        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.lavalink.nodes);

        this.shoukaku.on('error', (_, error) => console.error('Lavalink Error:', error));
        this.shoukaku.on('ready', (name) => console.log(`Lavalink Node ${name} is ready`));
        this.shoukaku.on('close', (name, code, reason) => console.warn(`Lavalink Node ${name} closed: ${code} ${reason}`));
    }
}

export default LavalinkManager;
