/* eslint-disable @typescript-eslint/no-require-imports -- Node standalone gateway uses CommonJS. */
// Same-origin HTTP and WebSocket gateway for both Next development and standalone builds.
const http=require('node:http');
const https=require('node:https');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
function start() {
    const envFile=process.env.ENV_FILE || path.resolve(__dirname,'../.env');
    if(fs.existsSync(envFile)) process.loadEnvFile(envFile);
    const dev=process.argv.includes('--dev');
    const port=Number(process.env.FRONTEND_PORT || process.env.PORT || 3001);
    const nextPort=Number(process.env.NEXT_INTERNAL_PORT || 3002);
    const standalone=fs.existsSync(path.join(__dirname,'server.js')) ? path.join(__dirname,'server.js') : path.join(__dirname,'.next/standalone/server.js');
    const nextArgs=dev ? [require.resolve('next/dist/bin/next'),'dev','--port',String(nextPort),'--hostname','127.0.0.1'] : [standalone];
    const child=spawn(process.execPath,nextArgs,{stdio:'inherit',windowsHide:true,env:{...process.env,PORT:String(nextPort),HOSTNAME:'127.0.0.1'}});
    const gateway=createGateway({backend:process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000',nextPort});
    gateway.listen(port,'0.0.0.0',() => console.log('Dashboard gateway listening on '+port));
    let closing=false;
    const stop=() => {if(closing)return;closing=true;gateway.close();child.kill();setTimeout(() => process.exit(0),1000).unref();};
    child.on('error',error => {console.error(error.message);stop();});
    child.on('exit',code => {if(!closing){gateway.close();process.exit(code || 1);}});
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
function createGateway({backend,nextPort}) {
    const backendUrl=new URL(backend);
    const server=http.createServer((req,res) => {
        const url=new URL(req.url,'http://gateway');
        const target=url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') ? backendUrl : new URL('http://127.0.0.1:'+nextPort);
        const transport=target.protocol === 'https:' ? https : http;
        const headers={...req.headers};
        // Preserve the TLS terminator's protocol only; the backend must trust the configured proxy hops.
        headers['x-forwarded-proto']=req.headers['x-forwarded-proto'] || 'http';
        headers['x-forwarded-for']=req.socket.remoteAddress;
        const upstream=transport.request({hostname:target.hostname,port:target.port || (target.protocol === 'https:' ? 443 : 80),
            path:req.url,method:req.method,headers},incoming => {res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});
        upstream.on('error',() => {if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end('{"error":"Backend or dashboard is starting; please retry"}');});
        req.on('aborted',() => upstream.destroy());req.pipe(upstream);
    });
    server.on('upgrade',(req,socket,head) => {
        const url=new URL(req.url,'http://gateway');
        const target=url.pathname === '/api/live' ? backendUrl : new URL('http://127.0.0.1:'+nextPort);
        const transport=target.protocol === 'https:' ? https : http;
        const upstream=transport.request({hostname:target.hostname,port:target.port || (target.protocol === 'https:' ? 443 : 80),
            path:req.url,method:'GET',headers:req.headers});
        upstream.on('upgrade',(response,remote,remoteHead) => {
            const headers=Object.entries(response.headers).map(([key,value]) => key+': '+value).join('\r\n');
            socket.write('HTTP/1.1 101 Switching Protocols\r\n'+headers+'\r\n\r\n');
            if(remoteHead.length)socket.write(remoteHead);
            if(head.length)remote.write(head);
            remote.on('error',() => socket.destroy());socket.on('error',() => remote.destroy());
            remote.pipe(socket);socket.pipe(remote);
        });
        upstream.on('response',response => {socket.write('HTTP/1.1 '+response.statusCode+' Rejected\r\nConnection: close\r\n\r\n');socket.destroy();});
        upstream.on('error',() => socket.destroy());socket.on('close',() => upstream.destroy());upstream.end();
    });
    return server;
}
module.exports={createGateway};
if(require.main === module)start();
