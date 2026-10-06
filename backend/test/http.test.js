import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createApiRouter} from '../src/routes/api.js';
import {attachLive} from '../src/services/live.js';
import {WebSocket} from 'ws';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createGateway}=require('../../frontend/proxy.cjs');
test('HTTP routes enforce login, guild access and playlist ownership',async()=>{
    const app=express();app.use(express.json());
    app.use((req,_res,next)=>{req.user={id:req.get('x-user') || 'user'};req.isAuthenticated=()=>req.get('x-auth') === 'yes';next();});
    const services={
        access:{guilds:async()=>[],check:async(id)=>{if(id === '99999')throw Object.assign(new Error('Denied'),{status:403});}},
        actions:{execute:async(_g,_u,action)=>({success:true,action})},
        database:{playlist:async(user)=>{if(user !== 'owner')throw Object.assign(new Error('Not found'),{status:404});return {id:1};}},
        playerController:{snapshot:async id=>({guildId:id,queue:[]})},ai:{},commandHandler:{commands:new Map()}
    };
    app.use('/api',createApiRouter(services));
    app.use((error,_req,res,_next)=>res.status(error.status || 500).json({error:error.message}));
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    try {
        assert.equal((await fetch(base+'/api/queue/12345')).status,401);
        assert.equal((await fetch(base+'/api/queue/99999',{headers:{'x-auth':'yes'}})).status,403);
        assert.equal((await fetch(base+'/api/queue/12345',{headers:{'x-auth':'yes'}})).status,200);
        assert.equal((await fetch(base+'/api/playlists/1',{headers:{'x-auth':'yes'}})).status,404);
        assert.equal((await fetch(base+'/api/playlists/1',{headers:{'x-auth':'yes','x-user':'owner'}})).status,200);
    } finally {await new Promise(resolve=>server.close(resolve));}
});
test('gateway forwards HTTP cookies and live WebSocket updates on the same origin',async()=>{
    const backend=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cookie:req.headers.cookie}));});
    const player=new EventEmitter();player.snapshot=async id=>({guildId:id,revision:1,queue:[]});
    const sessionMiddleware=(req,_res,next)=>{req.sessionID='session';req.user={id:'user'};next();};
    const passport={initialize:()=> (req,_res,next)=>{req.isAuthenticated=()=>true;next();},session:()=> (_req,_res,next)=>next()};
    const stop=attachLive(backend,{sessionMiddleware,passport,access:{check:async()=>{}},playerController:player,
        sessionStore:{get:(_id,callback)=>callback(null,{passport:{user:{id:'user'}}})},origin:'http://dashboard',ready:()=>true});
    backend.listen(0,'127.0.0.1');await once(backend,'listening');
    const gateway=createGateway({backend:'http://127.0.0.1:'+backend.address().port,nextPort:1});
    gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
    const port=gateway.address().port;
    let ws;
    try {
        const response=await fetch('http://127.0.0.1:'+port+'/api/test',{headers:{Cookie:'mikrotech.sid=abc'}});
        assert.equal((await response.json()).cookie,'mikrotech.sid=abc');
        ws=new WebSocket('ws://127.0.0.1:'+port+'/api/live?guildId=12345',{origin:'http://dashboard'});
        const [raw]=await once(ws,'message');
        assert.equal(JSON.parse(raw).guildId,'12345');
        ws.close();await once(ws,'close');
        const forbidden=new WebSocket('ws://127.0.0.1:'+port+'/api/live?guildId=12345',{origin:'http://evil'});
        forbidden.on('error',()=>{});
        await new Promise(resolve => forbidden.once('close',resolve));
    } finally {ws?.terminate();await stop();await new Promise(resolve=>gateway.close(resolve));await new Promise(resolve=>backend.close(resolve));}
});
