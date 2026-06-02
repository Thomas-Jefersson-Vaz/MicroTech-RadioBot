import { createClient } from 'redis';
import { config } from '../config/env.js';

class QueueService {
    constructor() {
        this.client = createClient({ url: config.redis.url });
        this.client.on('error', err => console.error('Redis Client Error', err));
        this.client.connect().then(() => console.log('Connected to Redis for Queue Management'));
    }

    async add(guildId, tracks) {
        const key = `queue:${guildId}`;
        const strings = tracks.map(t => JSON.stringify(t));
        await this.client.rPush(key, strings);
        return await this.client.lLen(key);
    }

    async next(guildId) {
        const key = `queue:${guildId}`;
        const item = await this.client.lPop(key);
        return item ? JSON.parse(item) : null;
    }

    async peek(guildId) {
        const key = `queue:${guildId}`;
        const item = await this.client.lIndex(key, 0);
        return item ? JSON.parse(item) : null;
    }

    async getQueue(guildId) {
        const key = `queue:${guildId}`;
        const items = await this.client.lRange(key, 0, -1);
        return items.map(i => JSON.parse(i));
    }

    async clear(guildId) {
        const key = `queue:${guildId}`;
        await this.client.del(key);
    }

    async shuffle(guildId) {
        const key = `queue:${guildId}`;
        const items = await this.client.lRange(key, 0, -1);
        if (items.length <= 1) return;

        // Fisher-Yates
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }

        const multi = this.client.multi();
        multi.del(key);
        multi.rPush(key, items);
        await multi.exec();
    }
}

export default new QueueService();
