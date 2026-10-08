import { fail, integer, text } from '../utils/validation.js';

export const MUSIC_ACTIONS = ['play','skip','stop','pause','resume','volume','clear','shuffle','jump','move','filter','playlist-load'];
export class ActionService {
    constructor(player,database,access) { Object.assign(this,{player,database,access}); player.authorize = (guild,user,control) => access.check(guild,user,control); }
    async execute(guildId,user,action,args = {},context = {}) {
        if (!MUSIC_ACTIONS.includes(action)) fail('Unknown music action');
        const access = await this.access.check(guildId,user.id,true);
        let result;
        switch(action) {
            case 'play': result = await this.player.enqueue(guildId,access.channelId,user,text(args.query,2000,'Query'),context.textChannelId || args.textChannelId); break;
            case 'skip': result = await this.player.skip(guildId); break;
            case 'stop': result = await this.player.stop(guildId); break;
            case 'pause': result = await this.player.pause(guildId,args.toggle === true ? 'toggle' : true,access.channelId); break;
            case 'resume': result = await this.player.pause(guildId,false,access.channelId); break;
            case 'volume': result = await this.player.volume(guildId,integer(args.value,0,100,'Volume')); break;
            case 'filter': result = await this.player.filter(guildId,text(args.preset,20,'Filter')); break;
            case 'jump': result = await this.player.editQueue(guildId,'jump',args.position); break;
            case 'move': result = await this.player.editQueue(guildId,'move',args.from,args.to); break;
            case 'clear': case 'shuffle': result = await this.player.editQueue(guildId,action); break;
            case 'playlist-load': {
                const playlist = await this.database.playlist(user.id,args.id);
                if (!playlist.items.length) fail('Playlist is empty');
                result = await this.player.enqueueTracks(guildId,access.channelId,user,playlist.items.map(item => ({
                    url:item.url, info:{ title:item.title || item.url,uri:item.url,length:(item.duration || 0)*1000,author:'Unknown' }
                })),context.textChannelId);
                break;
            }
        }
        if (result === false) fail('No active player; use /play first',409);
        if (result?.type === 'empty') fail('No playable results found',404);
        return { success:true,...(typeof result === 'object' ? result : {}) };
    }
}
