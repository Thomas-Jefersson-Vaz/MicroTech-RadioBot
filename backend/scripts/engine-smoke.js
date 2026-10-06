import {WebSocket} from 'ws';
import {once} from 'node:events';
import {EventEmitter} from 'node:events';
import LavalinkManager from '../src/services/lavalink.js';
import {config} from '../src/config/env.js';
const host=process.env.NODELINK_URL || 'localhost:2333';
const password=process.env.NODELINK_PASSWORD;
if(!password)throw new Error('NODELINK_PASSWORD is required');
let available=false;
for(let attempt=0;attempt<30;attempt++) {
    try {
        const response=await fetch('http://'+host+'/version',{headers:{Authorization:password},signal:AbortSignal.timeout(2000)});
        if(response.ok){console.log('NodeLink version:',await response.text());available=true;break;}
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,1000));
}
if(!available)throw new Error('NodeLink did not become healthy within 30 seconds');
const response=await fetch('http://'+host+'/v4/info',{headers:{Authorization:password}});
if(!response.ok)throw new Error('NodeLink info endpoint failed');
const info=await response.json();
console.log('Sources:',info.sourceManagers,'Filters:',info.filters);
const socket=new WebSocket('ws://'+host+'/v4/websocket',{headers:{Authorization:password,'User-Id':'123456789012345678','Client-Name':'MikroTechSmoke/1.0'}});
const timeout=setTimeout(()=>socket.terminate(),5000);
try {
    const [raw]=await once(socket,'message');
    const event=JSON.parse(raw.toString());
    if(event.op !== 'ready')throw new Error('Expected NodeLink ready event');
    console.log('NodeLink protocol handshake passed');
} finally {clearTimeout(timeout);socket.close();}
// Exercise the actual client and subscription order without a Discord login.
config.lavalink.nodes=[{name:'Smoke',url:host,auth:password}];
const client=new EventEmitter();client.user={id:'123456789012345678'};
const manager=new LavalinkManager(client);
try {
    const ready=once(manager.shoukaku,'ready',{signal:AbortSignal.timeout(10000)});
    client.emit('clientReady');
    await ready;
    if(!manager.getNode())throw new Error('Shoukaku did not connect to NodeLink');
    await manager.getNode().rest.updateSession(true,120);
    console.log('Shoukaku initialization and NodeLink compatibility passed');
    const reconnected=once(manager.shoukaku,'ready',{signal:AbortSignal.timeout(15000)});
    manager.getNode().ws.terminate();
    await reconnected;
    if(!manager.getNode())throw new Error('Node unavailable after reconnect');
    console.log('Shoukaku reconnect passed');
} finally {await manager.destroy();}
