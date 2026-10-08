import express from 'express';
import { createServer } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Client,GatewayIntentBits,REST,Routes } from 'discord.js';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { config,validateConfig } from './config/env.js';
import passport,{configurePassport} from './config/passport.js';
import LavalinkManager from './services/lavalink.js';
import PlayerController from './services/player.js';
import QueueService from './services/queue.js';
import DatabaseService from './services/database.js';
import CommandHandler from './handlers/commandHandler.js';
import { AccessService } from './services/access.js';
import { ActionService } from './services/actions.js';
import { AiService } from './services/ai.js';
import { NowPlayingService } from './services/nowplaying.js';
import { attachLive } from './services/live.js';
import { createApiRouter } from './routes/api.js';
import authRouter from './routes/auth.js';
import createLogger from './utils/logger.js';
const log = createLogger('Init');
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
validateConfig();
configurePassport();
const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
const app = express();
app.set('trust proxy',config.trustProxy);
app.use(express.json({limit:'32kb'}));
const sessionStore = new RedisStore({client:QueueService.client,prefix:'session:'});
const sessionMiddleware = session({name:'mikrotech.sid',store:sessionStore,secret:config.sessionSecret,resave:false,saveUninitialized:false,
    cookie:{secure:config.secureCookies,httpOnly:true,sameSite:'lax',maxAge:86400000}});
app.use(sessionMiddleware,passport.initialize(),passport.session());
app.use((req,res,next) => {
    if(['POST','DELETE','PUT','PATCH'].includes(req.method) && req.get('origin') !== new URL(config.frontendUrl).origin)
        return res.status(403).json({error:'Request origin is not allowed'});
    next();
});
let manager,player,services,stopLive,memoryTimer;
let registered = false;
let dependencyHealth = false;
let registrationError = null;
const ready = () => Boolean(client.isReady() && registered && DatabaseService.ready && QueueService.client.isReady && dependencyHealth && manager?.getNode());
const health = () => ({
    ready:ready(),discord:client.isReady(),redis:QueueService.client.isReady,postgres:DatabaseService.ready,
    commands:{registered,names:[...CommandHandler.commands.keys()],error:registrationError},
    audio:manager ? [...manager.shoukaku.nodes.values()].map(node => ({name:node.name,state:node.state,stats:node.stats})) : [],
    diagnostics:{ ...player?.diagnostics, eventLoopMs:{ mean:Math.round(eventLoop.mean/1e6) || 0,
        p99:Math.round(eventLoop.percentile(99)/1e6),max:Math.round(eventLoop.max/1e6) },memoryBytes:process.memoryUsage().rss },
    build:config.buildRevision,uptime:Math.floor(process.uptime())
});
app.get('/',(_req,res) => res.json({message:'MikroTech Radio V3',build:config.buildRevision}));
app.get('/health',(_req,res) => res.json(health()));
app.get('/ready',(_req,res) => res.status(ready() ? 200 : 503).json(health()));
app.use('/auth',authRouter);
app.use('/api',(req,res,next) => {
    if(!ready()) return res.status(503).json({error:'Bot dependencies are unavailable. Please retry.'});
    next();
},(req,res,next) => services.router(req,res,next));
app.use((error,req,res,_next) => {
    log.error('Request failed',{path:req.path,message:error.message});
    if(res.headersSent) return;
    res.status(error.status || 500).json({error:error.status ? error.message : 'Service unavailable. Check backend logs.'});
});
const server = createServer(app);
// Shoukaku must subscribe before Discord emits clientReady.
manager = new LavalinkManager(client);
player = new PlayerController(client,manager);
const access = new AccessService(client);
const actions = new ActionService(player,DatabaseService,access);
const ai = new AiService(DatabaseService,actions);
const nowPlaying = new NowPlayingService(client,player,access);
services = {access,actions,ai,nowPlaying,playerController:player,database:DatabaseService,commandHandler:CommandHandler};
services.router = createApiRouter(services);
player.on('failure',failure => log.error('Playback retry limit',failure));
stopLive = attachLive(server,{sessionMiddleware,passport,access,playerController:player,sessionStore,origin:new URL(config.frontendUrl).origin,ready});
client.on('interactionCreate',interaction => CommandHandler.handleInteraction(interaction,{...services,ready}));
client.on('messageCreate',async message => {
    if(!message.guildId || message.author.bot) return;
    try {
        if(!ready()) return;
        if(!/^[\/!]/.test(message.content.trim())) await DatabaseService.awardXp(message.guildId,message.author.id,message.content.length);
        if(!message.mentions.users.has(client.user.id)) return;
        await message.channel.sendTyping();
        const reply = await services.ai.respond(message.guildId,message.author,message.content.replace(/<@!?\d+>/g,'').trim(),{textChannelId:message.channelId});
        await message.reply({content:reply.slice(0,1900),allowedMentions:{parse:[],repliedUser:false}});
    } catch(error) {
        log.error('Message processing failed',error.message);
        if(message.mentions.users.has(client.user.id)) await message.reply({content:error.status ? error.message : 'Service unavailable. Please try again.',allowedMentions:{parse:[],repliedUser:false}}).catch(() => {});
    }
});
let registering=false;
let lastRegistrationAttempt=0;
async function registerCommands() {
    if(registering || registered || !client.isReady()) return;
    registering=true;lastRegistrationAttempt=Date.now();
    const rest = new REST({version:'10'}).setToken(config.discord.token);
    const route = config.discord.guildId ? Routes.applicationGuildCommands(config.discord.clientId,config.discord.guildId) : Routes.applicationCommands(config.discord.clientId);
    try {
        const names = await CommandHandler.register(rest,route);
        registered=true;
        registrationError=null;
        log.info('Discord commands verified',names);
    } catch(error) { registrationError=error.message;log.error('Command registration failed',error.message); }
    finally { registering=false; }
}
client.once('clientReady',registerCommands);
let closing = false;
let healthTimer;
async function shutdown(signal, exitCode = 0) {
    if(closing) return;
    closing=true;registered=false;
    eventLoop.disable();
    log.info('Shutting down',signal);
    const forcedExit = setTimeout(() => process.exit(1),10000);
    clearInterval(memoryTimer);clearInterval(healthTimer);
    try {
        await nowPlaying.close();
        if(stopLive) await stopLive();
        if(player) for(const id of manager.shoukaku.players.keys()) player.invalidate(id);
        if(manager) await manager.destroy();
        client.destroy();
        await new Promise(resolve => server.close(resolve));
        await QueueService.disconnect();
        await DatabaseService.shutdown();
        clearTimeout(forcedExit);
        process.exit(exitCode);
    } catch(error) { log.error('Shutdown failed',error.message);process.exit(1); }
}
process.on('SIGINT',() => shutdown('SIGINT'));
process.on('SIGTERM',() => shutdown('SIGTERM'));
process.on('unhandledRejection',error => log.error('Unhandled rejection',error));
process.on('uncaughtException',error => { log.error('Uncaught exception',error);void shutdown('uncaughtException',1); });
async function start() {
    await CommandHandler.loadCommands();
    // Start health endpoints while waiting for infrastructure.
    await new Promise(resolve => server.listen(config.port,resolve));
    for(let attempt=0;attempt<12;attempt++) {
        try { await QueueService.connect();await DatabaseService.initializeDatabase();dependencyHealth=true;break; }
        catch(error) {
            log.warn('Infrastructure initialization failed',{attempt:attempt+1,message:error.message});
            if(attempt === 11) throw error;
            await new Promise(resolve => setTimeout(resolve,5000));
        }
    }
    memoryTimer=setInterval(() => DatabaseService.pruneMemories().catch(error => log.error('Memory cleanup failed',error.message)),3600000);
    let checking=false;
    healthTimer=setInterval(async () => {
        if(checking) return;
        checking=true;
        try { await Promise.all([QueueService.client.ping(),DatabaseService.pool.query('SELECT 1')]);dependencyHealth=true; }
        catch { dependencyHealth=false; }
        finally { checking=false; }
        if(!registered && Date.now()-lastRegistrationAttempt >= 60000) void registerCommands();
    },10000);
    await client.login(config.discord.token);
    log.info('API listening',{port:config.port,build:config.buildRevision});
}
start().catch(error => { log.error('Startup failed',error.message);void shutdown('startup failure',1); });
