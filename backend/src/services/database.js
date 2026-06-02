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

        // Test connection
        this.pool.query('SELECT NOW()')
            .then(() => console.log('[Database] Connected to PostgreSQL'))
            .catch(err => console.error('[Database] Connection failed:', err.message));
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
