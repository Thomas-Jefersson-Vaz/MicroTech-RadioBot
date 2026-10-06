import express from 'express';
import { integer } from '../utils/validation.js';
const asyncRoute = operation => (req,res,next) => Promise.resolve(operation(req,res)).catch(next);
export function createApiRouter(services) {
    const router = express.Router();
    const { access,actions,database,playerController,ai } = services;
    router.use((req,res,next) => {
        if (!req.isAuthenticated()) return res.status(401).json({error:'Login with Discord first'});
        next();
    });
    router.get('/guilds',asyncRoute(async (req,res) => res.json({guilds:await access.guilds(req.user.id)})));
    router.param('guildId', (req,res,next,id) => {
        if (!/^\d{5,32}$/.test(id)) return res.status(400).json({error:'Invalid server ID'});
        Promise.resolve(access.check(id,req.user.id)).then(() => next(),next);
    });
    router.get('/queue/:guildId',asyncRoute(async (req,res) => res.json(await playerController.snapshot(req.params.guildId))));
    router.post('/control/:guildId/:action',asyncRoute(async (req,res) => res.json(await actions.execute(req.params.guildId,req.user,req.params.action,req.body))));
    router.get('/history/:guildId',asyncRoute(async (req,res) => res.json({history:await database.getHistory(req.params.guildId,integer(req.query.limit || 20,1,50,'Limit'))})));
    router.get('/rank/:guildId',asyncRoute(async (req,res) => res.json(await database.rank(req.params.guildId,req.user.id))));
    router.get('/leaderboard/:guildId',asyncRoute(async (req,res) => res.json({leaderboard:await database.leaderboard(req.params.guildId)})));
    router.get('/settings/:guildId',asyncRoute(async (req,res) => res.json({volume:(await database.getGuildSettings(req.params.guildId))?.volume_preferencial ?? 100})));
    router.post('/settings/:guildId',asyncRoute(async (req,res) => {
        await access.check(req.params.guildId,req.user.id,false,true);
        await playerController.volume(req.params.guildId,integer(req.body.volume,0,100,'Volume'));
        res.json({success:true});
    }));
    router.get('/playlists',asyncRoute(async (req,res) => res.json({playlists:await database.playlists(req.user.id)})));
    router.post('/playlists',asyncRoute(async (req,res) => res.status(201).json(await database.createPlaylist(req.user.id,req.body.name))));
    router.get('/playlists/:id',asyncRoute(async (req,res) => res.json(await database.playlist(req.user.id,req.params.id))));
    router.post('/playlists/:id/items',asyncRoute(async (req,res) => res.status(201).json(await database.addPlaylistItem(req.user.id,req.params.id,req.body))));
    router.delete('/playlists/:id/items/:position',asyncRoute(async (req,res) => {
        await database.removePlaylistItem(req.user.id,req.params.id,integer(req.params.position,1,1000000,'Position'));
        res.json({success:true});
    }));
    router.delete('/playlists/:id',asyncRoute(async (req,res) => { await database.deletePlaylist(req.user.id,req.params.id); res.json({success:true}); }));
    router.post('/memory/:guildId/clear',asyncRoute(async (req,res) => { await ai.clear(req.params.guildId,req.user.id); res.json({success:true}); }));
    router.get('/commands',(_req,res) => res.json({commands:[...services.commandHandler.commands.keys()]}));
    router.use((_req,res) => res.status(404).json({error:'API route not found'}));
    return router;
}
