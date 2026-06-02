import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = {
    // API Port: Allow override, default to 3000
    port: process.env.PORT || process.env.API_PORT || 3000,
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
    },
    redis: {
        // Prioritize REDIS_URL first, then construct from HOST/PORT defaults
        url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    },
    postgres: {
        user: process.env.POSTGRES_USER || 'admin',
        host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'mikrotech_v3',
        password: process.env.POSTGRES_PASSWORD || 'admin',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
    },
    lavalink: {
        nodes: [
            {
                name: 'MikroTechNode',
                // Prioritize LAVALINK_URL, else construct
                url: process.env.LAVALINK_URL || `${process.env.LAVALINK_HOST || 'localhost'}:${process.env.LAVALINK_PORT || 2333}`,
                auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass'
            }
        ]
    }
};
