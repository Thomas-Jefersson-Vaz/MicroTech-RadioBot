import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { integer } from '../utils/validation.js';

export class QueueService {
    constructor(client = createClient({ url: config.redis.url })) { this.client = client; }
    async connect() { if (!this.client.isOpen) await this.client.connect(); await this.client.ping(); }
    async add(guildId, tracks) {
        if (!tracks.length) return this.client.lLen('queue:' + guildId);
        await this.client.rPush('queue:' + guildId, tracks.map(track => JSON.stringify({ ...track, id: randomUUID() })));
        return this.client.lLen('queue:' + guildId);
    }
    async next(guildId, expected) {
        // Compare and pop in one operation: concurrent edits never consume a different head.
        const item = await this.client.eval(`
            local head = redis.call('LINDEX', KEYS[1], 0)
            if not head then return false end
            if ARGV[1] ~= '' and head ~= ARGV[1] then return false end
            return redis.call('LPOP', KEYS[1])
        `, { keys: ['queue:' + guildId], arguments: [expected ? JSON.stringify(expected) : ''] });
        return item ? JSON.parse(item) : null;
    }
    async peek(guildId) { const item = await this.client.lIndex('queue:' + guildId, 0); return item ? JSON.parse(item) : null; }
    async getQueue(guildId) { return (await this.client.lRange('queue:' + guildId, 0, -1)).map(JSON.parse); }
    async clear(guildId) { await this.client.del('queue:' + guildId); }
    async edit(guildId, action, from, to) {
        // Lua operates on the list in place; no read/delete/reinsert race.
        const length = await this.client.lLen('queue:' + guildId);
        if (action !== 'shuffle') integer(from, 1, length, 'Position');
        if (action === 'move') integer(to, 1, length, 'Destination');
        const script = `
            local items = redis.call('LRANGE', KEYS[1], 0, -1)
            local action = ARGV[1]
            local src = tonumber(ARGV[2])
            local dst = tonumber(ARGV[3])
            if action ~= 'shuffle' and (not src or src < 1 or src > #items) then return redis.error_reply('Invalid position') end
            if action == 'move' then
                if not dst or dst < 1 or dst > #items then return redis.error_reply('Invalid destination') end
                local item = table.remove(items, src)
                table.insert(items, dst, item)
            elseif action == 'jump' then
                for i = 1, src - 1 do table.remove(items, 1) end
            elseif action == 'shuffle' then
                for i = #items, 2, -1 do
                    local j = (tonumber(ARGV[i + 2]) % i) + 1
                    items[i], items[j] = items[j], items[i]
                end
            end
            redis.call('DEL', KEYS[1])
            for i = 1, #items do redis.call('RPUSH', KEYS[1], items[i]) end
            return #items
        `;
        const { randomInt } = await import('node:crypto');
        const randomness = Array.from({ length: length + 1 }, () => String(randomInt(0, 2147483647)));
        return this.client.eval(script, { keys: ['queue:' + guildId], arguments: [action, String(from || 0), String(to || 0), ...randomness] });
    }
    async shuffle(guildId) { return this.edit(guildId, 'shuffle'); }
    async disconnect() { if (this.client.isOpen) await this.client.quit(); }
}
const queue = new QueueService();
queue.client.on('error', error => console.error('[Redis]', error.message));
export default queue;
