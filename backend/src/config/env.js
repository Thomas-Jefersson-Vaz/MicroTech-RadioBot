import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: process.env.ENV_FILE || fileURLToPath(new URL('../../../.env', import.meta.url)) });
const number = (name, fallback) => {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1) throw new Error(name + ' must be a positive integer');
    return value;
};
export const config = {
    port: number('API_PORT', 3000),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
    sessionSecret: process.env.SESSION_SECRET,
    secureCookies: process.env.COOKIE_SECURE === 'true',
    trustProxy: Number(process.env.TRUST_PROXY || 0),
    buildRevision: process.env.IMAGE_REVISION || process.env.BUILD_REVISION || 'local',
    discord: { token: process.env.DISCORD_TOKEN, clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET, guildId: process.env.GUILD_ID },
    redis: { url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` },
    postgres: { user: process.env.POSTGRES_USER || 'admin', host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'mikrotech_v3', password: process.env.POSTGRES_PASSWORD || 'admin', port: number('POSTGRES_PORT', 5432) },
    lavalink: { nodes: [{ name: 'MikroTechNode', url: process.env.NODELINK_URL || process.env.LAVALINK_URL || `${process.env.LAVALINK_HOST || 'localhost'}:${process.env.NODELINK_PORT || process.env.LAVALINK_PORT || 2333}`,
        auth: process.env.NODELINK_PASSWORD || process.env.LAVALINK_PASSWORD || 'youshallnotpass' }] },
    ai: { geminiKey: process.env.GEMINI_API_KEY, geminiModel: process.env.GEMINI_MODEL,
        groqKey: process.env.GROQ_API_KEY, groqModel: process.env.GROQ_MODEL }
};
export function validateConfig() {
    for (const [name, value] of Object.entries({ DISCORD_TOKEN: config.discord.token, DISCORD_CLIENT_ID: config.discord.clientId,
        DISCORD_CLIENT_SECRET: config.discord.clientSecret, SESSION_SECRET: config.sessionSecret })) {
        if (!value) throw new Error('Missing environment variable: ' + name);
    }
    if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
    if (config.ai.geminiKey && !config.ai.geminiModel) throw new Error('Set GEMINI_MODEL with GEMINI_API_KEY');
    if (config.ai.groqKey && !config.ai.groqModel) throw new Error('Set GROQ_MODEL with GROQ_API_KEY');
}
