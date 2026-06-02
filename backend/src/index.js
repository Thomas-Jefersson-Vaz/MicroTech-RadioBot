import express from 'express';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from './config/env.js';
import LavalinkManager from './services/lavalink.js';
import PlayerController from './services/player.js';
import CommandHandler from './handlers/commandHandler.js';

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

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    const commandsData = Array.from(CommandHandler.commands.values()).map(c => c.data.toJSON());
    const guildId = process.env.GUILD_ID; // Set this in .env for instant dev registration

    try {
        if (guildId) {
            // Guild-scoped = instant propagation (ideal for development)
            console.log(`[Init] Registering ${commandsData.length} commands to guild ${guildId} (instant)...`);
            await rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, guildId),
                { body: commandsData },
            );
            console.log('[Init] Guild commands registered instantly.');
        } else {
            // Global = up to 1 hour propagation (for production)
            console.log(`[Init] Registering ${commandsData.length} commands globally (up to 1h propagation)...`);
            await rest.put(
                Routes.applicationCommands(config.discord.clientId),
                { body: commandsData },
            );
            console.log('[Init] Global commands registered.');
        }
    } catch (error) {
        console.error('[Init] Error registering commands:', error);
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`[Init] Loading commands...`);

    // Init Lavalink & Player
    lavalinkManager = new LavalinkManager(client);
    playerController = new PlayerController(client, lavalinkManager);

    // Init Commands
    await CommandHandler.loadCommands();
    await registerCommands();

    isReady = true;
    console.log('[Init] Bot is fully ready. API accepting requests.');
});

client.on('interactionCreate', async interaction => {
    // Pass playerController to context
    await CommandHandler.handleInteraction(interaction, { playerController });
});

// API Routes
app.get('/', (req, res) => {
    res.json({ message: 'MikroTech Radio V3 API', status: 'running' });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', discord: client.isReady() });
});

const start = async () => {
    try {
        await client.login(config.discord.token);
        app.listen(config.port, () => {
            console.log(`Backend API running on port ${config.port}`);
        });
    } catch (error) {
        console.error('Failed to start application:', error);
    }
};

start();
