import express from 'express';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from './config/env.js';
import LavalinkManager from './services/lavalink.js';
import PlayerController from './services/player.js';
import QueueService from './services/queue.js';
import DatabaseService from './services/database.js';
import CommandHandler from './handlers/commandHandler.js';
import createLogger from './utils/logger.js';

const log = createLogger('Init');

// ── Global error handlers ──────────────────────────────────────────────────

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    // Give time for the log to flush, then exit
    setTimeout(() => process.exit(1), 1000);
});

// Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize Express API
const app = express();
app.use(express.json());

// Middleware (Session & Auth)
import session from 'express-session';
import passport from './config/passport.js';
import cookieParser from 'cookie-parser';

app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_keyboard_cat',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true in prod
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Routes
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';

let lavalinkManager;
let playerController;
let isReady = false; // Set true after Discord 'ready' fires
let server; // HTTP server reference for graceful shutdown

// Readiness guard: reject API calls until bot is fully initialized
app.use((req, res, next) => {
    // Skip guard for health checks and auth routes
    if (req.path === '/health' || req.path === '/' || req.path.startsWith('/auth')) {
        return next();
    }
    if (!isReady) {
        return res.status(503).json({ error: 'Bot is starting up, please retry in a moment.' });
    }
    req.services = { playerController };
    next();
});

app.use('/auth', authRouter);
app.use('/api', apiRouter);

// ── Global Express error handler ──────────────────────────────────────────

app.use((err, req, res, _next) => {
    log.error(`Express error on ${req.method} ${req.path}:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
});

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    const commandsData = Array.from(CommandHandler.commands.values()).map(c => c.data.toJSON());
    const guildId = process.env.GUILD_ID; // Set this in .env for instant dev registration

    try {
        if (guildId) {
            // Guild-scoped = instant propagation (ideal for development)
            log.info(`Registering ${commandsData.length} commands to guild ${guildId} (instant)...`);
            await rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, guildId),
                { body: commandsData },
            );
            log.info('Guild commands registered instantly.');
        } else {
            // Global = up to 1 hour propagation (for production)
            log.info(`Registering ${commandsData.length} commands globally (up to 1h propagation)...`);
            await rest.put(
                Routes.applicationCommands(config.discord.clientId),
                { body: commandsData },
            );
            log.info('Global commands registered.');
        }
    } catch (error) {
        log.error('Error registering commands:', error);
    }
}

client.once('ready', async () => {
    log.info(`Logged in as ${client.user.tag}!`);

    // Init Lavalink & Player
    lavalinkManager = new LavalinkManager(client);
    playerController = new PlayerController(client, lavalinkManager);

    // Init Commands (recursive scan)
    const loadedNames = await CommandHandler.loadCommands();
    log.info(`Loaded ${loadedNames.length} command(s) from disk: ${loadedNames.map(n => `/${n}`).join(', ') || '(none)'}`);

    // Register with Discord API
    await registerCommands();

    // Log the commands that are now live on Discord
    const registeredNames = Array.from(CommandHandler.commands.keys());
    log.info(`✅ Successfully registered ${registeredNames.length} command(s): ${registeredNames.map(n => `/${n}`).join(', ') || '(none)'}`);

    isReady = true;
    log.info('Bot is fully ready. API accepting requests.');
});

client.on('interactionCreate', async interaction => {
    log.info(`[Raw] Received interaction: ${interaction.type} - Command: ${interaction.commandName}`);
    // Pass playerController to context
    await CommandHandler.handleInteraction(interaction, { playerController });
});

// API Routes
app.get('/', (req, res) => {
    res.json({ message: 'MikroTech Radio V3 API', status: 'running' });
});

app.get('/health', (req, res) => {
    const lavalinkNodes = lavalinkManager
        ? [...lavalinkManager.shoukaku.nodes.values()].map(n => ({
            name: n.name,
            state: n.state,
            players: lavalinkManager.shoukaku.players.size,
        }))
        : [];

    res.json({
        status: 'ok',
        discord: client.isReady(),
        lavalink: lavalinkNodes,
        uptime: Math.floor(process.uptime()),
    });
});

// ── Graceful shutdown ──────────────────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info(`Received ${signal}. Starting graceful shutdown...`);

    // 1. Stop accepting new requests
    if (server) {
        server.close(() => log.info('HTTP server closed'));
    }

    // 2. Disconnect Lavalink players & nodes
    if (lavalinkManager) {
        try {
            await lavalinkManager.destroy();
        } catch (err) {
            log.warn('Error destroying Lavalink manager:', err.message);
        }
    }

    // 3. Disconnect Redis
    try {
        await QueueService.disconnect();
    } catch (err) {
        log.warn('Error disconnecting Redis:', err.message);
    }

    // 4. Close PostgreSQL pool
    try {
        await DatabaseService.shutdown();
    } catch (err) {
        log.warn('Error shutting down database:', err.message);
    }

    // 5. Destroy Discord client
    try {
        client.destroy();
        log.info('Discord client destroyed');
    } catch (err) {
        log.warn('Error destroying Discord client:', err.message);
    }

    log.info('Graceful shutdown complete. Goodbye!');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ── Start ──────────────────────────────────────────────────────────────────

const start = async () => {
    try {
        await client.login(config.discord.token);
        server = app.listen(config.port, () => {
            log.info(`Backend API running on port ${config.port}`);
        });
    } catch (error) {
        log.error('Failed to start application:', error);
        process.exit(1);
    }
};

start();
