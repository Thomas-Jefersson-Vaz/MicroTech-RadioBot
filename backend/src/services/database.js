import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;

class DatabaseService {
    constructor() {
        this.pool = new Pool({
            user: config.postgres.user,
            host: config.postgres.host,
            database: config.postgres.database,
            password: config.postgres.password,
            port: config.postgres.port,
        });

        this.pool.on('error', (err) => {
            console.error('[Database] Unexpected error on idle client:', err);
        });

        // Test connection and initialize schema
        this.initializeDatabase();
    }

    async initializeDatabase(retries = 8, delay = 5000) {
        const schema = `
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id VARCHAR(32) PRIMARY KEY,
                volume_preferencial INT DEFAULT 100,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS guild_users (
                guild_id VARCHAR(32) NOT NULL,
                user_id VARCHAR(32) NOT NULL,
                xp BIGINT DEFAULT 0,
                level INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (guild_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS history (
                id SERIAL PRIMARY KEY,
                guild_id VARCHAR(32) NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                requested_by VARCHAR(32),
                played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                user_id VARCHAR(32) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user_id, name)
            );

            CREATE TABLE IF NOT EXISTS playlist_items (
                id SERIAL PRIMARY KEY,
                playlist_id INT REFERENCES playlists(id) ON DELETE CASCADE,
                url TEXT NOT NULL,
                title TEXT,
                duration INT,
                added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_memories (
                user_id VARCHAR(32) PRIMARY KEY,
                memory_data JSONB,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_history_guild_id ON history(guild_id);
            CREATE INDEX IF NOT EXISTS idx_guild_users_xp ON guild_users(guild_id, xp DESC);
        `;

        for (let i = 0; i < retries; i++) {
            try {
                await this.pool.query('SELECT NOW()');
                console.log('[Database] Connected to PostgreSQL');
                await this.pool.query(schema);
                console.log('[Database] Schema initialized successfully');
                return; // Success, exit the retry loop
            } catch (err) {
                console.warn(`[Database] Connection attempt ${i + 1} failed: ${err.message}`);
                if (i < retries - 1) {
                    console.log(`[Database] Retrying in ${delay / 1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error('[Database] All connection attempts failed. Database schema not initialized.');
                }
            }
        }
    }


    // ── History ──────────────────────────────────────────────────────────────

    /**
     * Record a played track in the history table.
     */
    async recordHistory(guildId, title, url, requestedBy) {
        const query = `
            INSERT INTO history (guild_id, title, url, requested_by)
            VALUES ($1, $2, $3, $4)
        `;
        try {
            await this.pool.query(query, [guildId, title, url, requestedBy]);
        } catch (err) {
            console.error('[Database] Failed to record history:', err.message);
        }
    }

    /**
     * Get the last N played tracks for a guild.
     */
    async getHistory(guildId, limit = 10) {
        const query = `
            SELECT title, url, requested_by, played_at
            FROM history
            WHERE guild_id = $1
            ORDER BY played_at DESC
            LIMIT $2
        `;
        try {
            const result = await this.pool.query(query, [guildId, limit]);
            return result.rows;
        } catch (err) {
            console.error('[Database] Failed to get history:', err.message);
            return [];
        }
    }

    // ── Guild Settings ───────────────────────────────────────────────────────

    /**
     * Get settings for a guild (volume, etc.)
     */
    async getGuildSettings(guildId) {
        const query = `SELECT * FROM guild_settings WHERE guild_id = $1`;
        try {
            const result = await this.pool.query(query, [guildId]);
            return result.rows[0] || null;
        } catch (err) {
            console.error('[Database] Failed to get guild settings:', err.message);
            return null;
        }
    }

    /**
     * Create or update guild settings.
     */
    async upsertGuildSettings(guildId, settings) {
        const query = `
            INSERT INTO guild_settings (guild_id, volume_preferencial)
            VALUES ($1, $2)
            ON CONFLICT (guild_id)
            DO UPDATE SET volume_preferencial = EXCLUDED.volume_preferencial,
                          updated_at = CURRENT_TIMESTAMP
        `;
        try {
            await this.pool.query(query, [guildId, settings.volume ?? 100]);
        } catch (err) {
            console.error('[Database] Failed to upsert guild settings:', err.message);
        }
    }
}

export default new DatabaseService();
