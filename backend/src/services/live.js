import { WebSocketServer, WebSocket } from 'ws';
import { ServerResponse } from 'node:http';

export function attachLive(server,{sessionMiddleware,passport,access,playerController,sessionStore,origin,ready}) {
    const wss = new WebSocketServer({noServer:true,maxPayload:1024});
    const clients = new Map();
    const run = (middleware,req,res) => new Promise((resolve,reject) => middleware(req,res,error => error ? reject(error) : resolve()));
    server.on('upgrade',async (req,socket,head) => {
        try {
            const url = new URL(req.url,'http://backend');
            if(url.pathname !== '/api/live' || req.headers.origin !== origin || !ready()) throw new Error('Forbidden upgrade');
            const response = new ServerResponse(req);
            await run(sessionMiddleware,req,response);
            await run(passport.initialize(),req,response);
            await run(passport.session(),req,response);
            if(!req.isAuthenticated()) throw new Error('Unauthenticated upgrade');
            const guildId = url.searchParams.get('guildId');
            await access.check(guildId,req.user.id);
            if([...clients.values()].filter(c => c.userId === req.user.id).length >= 5) throw new Error('Too many connections');
            wss.handleUpgrade(req,socket,head,ws => {
                clients.set(ws,{guildId,userId:req.user.id,sessionId:req.sessionID,alive:true,sending:false});
                ws.on('pong',() => { const client=clients.get(ws); if(client) client.alive=true; });
                ws.on('close',() => clients.delete(ws));
                ws.on('error',() => ws.close());
                ws.on('message',() => ws.close(1008,'Read-only connection'));
                void send(ws);
            });
        } catch { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); }
    });
    async function send(ws) {
        const client = clients.get(ws);
        if(!client || client.sending || ws.readyState !== WebSocket.OPEN) return;
        client.sending=true;
        try {
            const session = await new Promise((resolve,reject) => sessionStore.get(client.sessionId,(error,data) => error ? reject(error) : resolve(data)));
            if(session?.passport?.user?.id !== client.userId) { ws.close(1008,'Session expired'); return; }
            await access.check(client.guildId,client.userId);
            if (!ready()) { ws.close(1013,'Dependencies unavailable'); return; }
            const snapshot = await playerController.snapshot(client.guildId);
            if(ws.bufferedAmount > 1024*1024) { ws.close(1013,'Slow connection'); return; }
            ws.send(JSON.stringify(snapshot));
        } catch { ws.close(1008,'Access unavailable'); }
        finally { client.sending=false; }
    }
    const dirty = new Set();
    const changed = id => dirty.add(id);
    playerController.on('change',changed);
    const updates = setInterval(() => {
        for(const [ws,client] of clients) if(dirty.has(client.guildId)) void send(ws);
        dirty.clear();
    },1000);
    const heartbeat = setInterval(() => {
        for(const [ws,client] of clients) {
            if(!client.alive) { ws.terminate(); continue; }
            client.alive=false; ws.ping(); void send(ws);
        }
    },15000);
    return async () => {
        clearInterval(updates);clearInterval(heartbeat);playerController.off('change',changed);
        for(const ws of clients.keys()) ws.terminate();
        await new Promise(resolve => wss.close(resolve));
    };
}
