import {Shoukaku,Connectors} from 'shoukaku';
import {config} from '../config/env.js';
import createLogger from '../utils/logger.js';
const log=createLogger('AudioEngine');
export default class LavalinkManager {
    constructor(client) {
        this.client=client;
        this.destroying=false;
        this.shoukaku=new Shoukaku(new Connectors.DiscordJS(client),config.lavalink.nodes,{
            reconnectTries:30,reconnectInterval:5,restTimeout:30,voiceConnectionTimeout:15,
            resume:true,resumeTimeout:120,resumeByLibrary:true,moveOnDisconnect:false
        });
        this.shoukaku.on('ready',(name,serverResume,libraryResume) => log.info('Node ready',{name,serverResume,libraryResume}));
        this.shoukaku.on('error',(name,error) => {if(!this.destroying)log.error('Node error',{name,message:error.message});});
        this.shoukaku.on('close',(name,code,reason) => {if(!this.destroying)log.warn('Node disconnected',{name,code,reason});});
        this.shoukaku.on('reconnecting',(name,remaining,seconds) => log.info('Node reconnecting',{name,remaining,seconds}));
        this.shoukaku.on('debug',(name,message) => log.debug(name,message));
        this.healthCheckTimer=setInterval(() => {
            if(this.destroying || !client.user) return;
            for(const configured of config.lavalink.nodes) {
                const node=this.shoukaku.nodes.get(configured.name);
                // Shoukaku removes exhausted nodes. Re-add instead of reconnecting a stale object.
                if(!node) {
                    log.warn('Re-adding audio node after exhausted retries',{name:configured.name});
                    this.shoukaku.addNode(configured);
                }
            }
        },30000);
    }
    getNode() {return this.destroying ? null : this.shoukaku.getIdealNode() || null;}
    async destroy() {
        this.destroying=true;
        clearInterval(this.healthCheckTimer);
        for(const id of [...this.shoukaku.players.keys()]) {
            try {await this.shoukaku.leaveVoiceChannel(id);}
            catch(error) {log.warn('Player shutdown failed',{guildId:id,message:error.message});}
        }
        for(const node of this.shoukaku.nodes.values()) {
            // Shoukaku reconnects from its socket-close listener even on normal closure.
            // Remove that listener before closing intentionally.
            node.ws?.removeAllListeners('close');
            node.disconnect(1000,'MikroTech shutdown');
        }
        this.shoukaku.nodes.clear();
    }
}
