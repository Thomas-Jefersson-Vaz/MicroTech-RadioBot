import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { config } from '../config/env.js';
import { fail, integer, text, webUrl } from '../utils/validation.js';

export class DatabaseService {
    constructor(pool = new pg.Pool({ user: config.postgres.user, host: config.postgres.host, database: config.postgres.database,
        password: config.postgres.password, port: config.postgres.port })) {
        this.pool = pool;
        this.ready = false;
        this.pool.on('error', error => console.error('[PostgreSQL]', error.message));
    }
    async transaction(operation) {
        const client = await this.pool.connect();
        try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
        catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    }
    async initializeDatabase() {
        await this.transaction(async client => {
            await client.query('SELECT pg_advisory_xact_lock(735109)');
            await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())');
            const directory = new URL('../../migrations/', import.meta.url);
            for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()) {
                if ((await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [file])).rowCount) continue;
                await client.query(await readFile(new URL(file, directory), 'utf8'));
                await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
            }
        });
        await this.pruneMemories();
        this.ready = true;
    }
    async recordHistory(guildId, title, url, user) {
        await this.pool.query('INSERT INTO history(guild_id,title,url,requested_by) VALUES($1,$2,$3,$4)', [guildId,title,url,user]);
    }
    async getHistory(id, limit = 10) {
        return (await this.pool.query('SELECT title,url,requested_by,played_at FROM history WHERE guild_id=$1 ORDER BY played_at DESC,id DESC LIMIT $2', [id,integer(limit,1,50,'Limit')])).rows;
    }
    async getGuildSettings(id) { return (await this.pool.query('SELECT * FROM guild_settings WHERE guild_id=$1', [id])).rows[0] || null; }
    async upsertGuildSettings(id, settings) {
        await this.pool.query('INSERT INTO guild_settings(guild_id,volume_preferencial) VALUES($1,$2) ON CONFLICT(guild_id) DO UPDATE SET volume_preferencial=EXCLUDED.volume_preferencial,updated_at=NOW()', [id,integer(settings.volume,0,100,'Volume')]);
    }
    async awardXp(guildId,userId,length) {
        const amount = Math.min(Math.max(length,0),200);
        if (!amount) return null;
        // Cooldown and increment are one SQL operation, including across backend restarts.
        return (await this.pool.query(`
            INSERT INTO guild_users(guild_id,user_id,xp,level,last_xp_at) VALUES($1,$2,$3::bigint,FLOOR(SQRT(($3::bigint)::numeric/100)),NOW())
            ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=guild_users.xp+EXCLUDED.xp,
                level=FLOOR(SQRT((guild_users.xp+EXCLUDED.xp)::numeric/100)),last_xp_at=NOW(),updated_at=NOW()
            WHERE guild_users.last_xp_at IS NULL OR guild_users.last_xp_at <= NOW()-INTERVAL '60 seconds'
            RETURNING xp,level
        `, [guildId,userId,amount])).rows[0] || null;
    }
    async rank(guildId,userId) {
        return (await this.pool.query(`
            SELECT * FROM (SELECT user_id,xp,level,RANK() OVER(ORDER BY xp DESC) AS rank FROM guild_users WHERE guild_id=$1) ranked WHERE user_id=$2
        `, [guildId,userId])).rows[0] || { user_id:userId,xp:0,level:0,rank:null };
    }
    async leaderboard(id) { return (await this.pool.query('SELECT user_id,xp,level FROM guild_users WHERE guild_id=$1 ORDER BY xp DESC,user_id LIMIT 20',[id])).rows; }
    async playlists(userId) { return (await this.pool.query('SELECT p.id,p.name,COUNT(i.id)::int AS count FROM playlists p LEFT JOIN playlist_items i ON i.playlist_id=p.id WHERE p.user_id=$1 GROUP BY p.id ORDER BY p.name',[userId])).rows; }
    async createPlaylist(userId,name) {
        try { return (await this.pool.query('INSERT INTO playlists(user_id,name) VALUES($1,$2) RETURNING id,name',[userId,text(name,100,'Name')])).rows[0]; }
        catch(error) { if(error.code === '23505') fail('A playlist with this name already exists',409); throw error; }
    }
    async ownedPlaylist(client,userId,id,lock = false) {
        const playlist = (await client.query('SELECT id,name FROM playlists WHERE user_id=$1 AND id=$2' + (lock ? ' FOR UPDATE' : ''),[userId,integer(id,1,2147483647,'Playlist ID')])).rows[0];
        if (!playlist) fail('Playlist not found',404);
        return playlist;
    }
    async playlist(userId,id) {
        const playlist = await this.ownedPlaylist(this.pool,userId,id);
        const items = (await this.pool.query('SELECT id,url,title,duration,position FROM playlist_items WHERE playlist_id=$1 ORDER BY position,id',[id])).rows;
        return { ...playlist,items };
    }
    async addPlaylistItem(userId,id,item) {
        const url = webUrl(item.url);
        return this.transaction(async client => {
            await this.ownedPlaylist(client,userId,id,true);
            return (await client.query(`
                INSERT INTO playlist_items(playlist_id,url,title,duration,position)
                SELECT $1,$2,$3,$4,COALESCE(MAX(position),0)+1 FROM playlist_items WHERE playlist_id=$1 RETURNING *
            `,[id,url,text(item.title || url,300,'Title'),integer(item.duration ?? 0,0,2147483647,'Duration')])).rows[0];
        });
    }
    async removePlaylistItem(userId,id,position) {
        return this.transaction(async client => {
            await this.ownedPlaylist(client,userId,id,true);
            const removed = await client.query('DELETE FROM playlist_items WHERE playlist_id=$1 AND position=$2',[id,integer(position,1,2147483647,'Position')]);
            if (!removed.rowCount) fail('Playlist position not found',404);
            await client.query('UPDATE playlist_items SET position=position-1 WHERE playlist_id=$1 AND position>$2',[id,position]);
        });
    }
    async deletePlaylist(userId,id) {
        await this.ownedPlaylist(this.pool,userId,id);
        await this.pool.query('DELETE FROM playlists WHERE id=$1 AND user_id=$2',[id,userId]);
    }
    async memories(guildId,userId) {
        return (await this.pool.query("SELECT turns FROM conversation_memories WHERE guild_id=$1 AND user_id=$2 AND updated_at>NOW()-INTERVAL '30 days'",[guildId,userId])).rows[0]?.turns || [];
    }
    async saveMemories(guildId,userId,turns) {
        await this.pool.query('INSERT INTO conversation_memories(guild_id,user_id,turns) VALUES($1,$2,$3) ON CONFLICT(guild_id,user_id) DO UPDATE SET turns=EXCLUDED.turns,updated_at=NOW()',[guildId,userId,JSON.stringify(turns.slice(-20))]);
    }
    async clearMemories(guildId,userId) { await this.pool.query('DELETE FROM conversation_memories WHERE guild_id=$1 AND user_id=$2',[guildId,userId]); }
    async pruneMemories() { await this.pool.query("DELETE FROM conversation_memories WHERE updated_at<=NOW()-INTERVAL '30 days'"); }
    async shutdown() { this.ready = false; await this.pool.end(); }
}
export default new DatabaseService();
