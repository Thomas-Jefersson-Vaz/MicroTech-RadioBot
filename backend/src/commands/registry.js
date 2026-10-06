import { SlashCommandBuilder } from 'discord.js';

const make = (name,description) => new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false);
const string = (builder,name,description,required = true) => builder.addStringOption(o => o.setName(name).setDescription(description).setRequired(required));
const int = (builder,name,description,min,max,required = true) => builder.addIntegerOption(o => o.setName(name).setDescription(description).setMinValue(min).setMaxValue(max).setRequired(required));
const music = (data,action,args = () => ({})) => ({
    data,
    async execute(interaction,{actions}) {
        await interaction.deferReply();
        const result = await actions.execute(interaction.guildId,interaction.user,action,args(interaction));
        await interaction.editReply({content:action === 'play' ? 'Added ' + result.count + ' track(s).' : 'Completed: ' + action + '.',allowedMentions:{parse:[]}});
    }
});
const commands = [
    music(string(make('play','Play a song, URL or playlist; supports &&, -s and -r.'),'query','Song, URL or playlist'),'play',i => ({query:i.options.getString('query'),textChannelId:i.channelId})),
    music(make('resume','Resume playback or retry the retained queue.'),'resume'),
    music(make('skip','Skip the current track.'),'skip'),
    music(make('stop','Stop playback, clear upcoming tracks and leave voice.'),'stop'),
    music(make('clear','Clear upcoming tracks, keeping the current song.'),'clear'),
    music(make('shuffle','Shuffle upcoming tracks.'),'shuffle'),
    music(int(make('volume','Set and save server volume (0–100).'),'value','Volume',0,100),'volume',i => ({value:i.options.getInteger('value')})),
    music(int(make('jump','Start an upcoming track, discarding preceding entries.'),'position','Upcoming queue position',1,1000000),'jump',i => ({position:i.options.getInteger('position')})),
    music(int(int(make('move','Move an upcoming track to another position.'),'from','Current upcoming position',1,1000000),'to','New upcoming position',1,1000000),'move',i => ({from:i.options.getInteger('from'),to:i.options.getInteger('to')})),
    music(make('filter','Replace the audio filter preset.').addStringOption(o => o.setName('preset').setDescription('Audio preset').setRequired(true).addChoices(...['reset','bassboost','nightcore','vaporwave'].map(name => ({name,value:name})))),'filter',i => ({preset:i.options.getString('preset')})),
    { data:make('pause','Toggle pause and resume.'), async execute(i,{actions,playerController}) {
        await i.deferReply();
        const action = playerController.getPlayerState(i.guildId)?.paused ? 'resume' : 'pause';
        await actions.execute(i.guildId,i.user,action);
        await i.editReply('Completed: ' + action + '.');
    }},
    { data:int(make('queue','Show upcoming tracks (10 per page).'),'page','Page',1,1000000,false), async execute(i,{access,playerController}) {
        await i.deferReply();
        await access.check(i.guildId,i.user.id);
        const snapshot = await playerController.snapshot(i.guildId);
        const page = Math.min(i.options.getInteger('page') || 1,Math.max(1,Math.ceil(snapshot.queue.length/10)));
        const start = (page-1)*10;
        const current = snapshot.current ? 'Now playing: ' + snapshot.current.info.title + '\n' : '';
        await i.editReply({content:(current + snapshot.queue.slice(start,start+10).map((t,n) => (start+n+1) + '. ' + t.info.title).join('\n') + '\nPage ' + page + ' • ' + snapshot.queue.length + ' upcoming').slice(0,1900),allowedMentions:{parse:[]}});
    }},
    { data:make('nowplaying','Show the current song and actual playback position.'), async execute(i,{access,playerController}) {
        await i.deferReply(); await access.check(i.guildId,i.user.id);
        const track = playerController.getCurrentTrack(i.guildId);
        const state = playerController.getPlayerState(i.guildId);
        await i.editReply({content:track ? track.info.title + '\n' + Math.floor((state?.position || 0)/1000) + ' / ' + Math.floor((state?.duration || 0)/1000) + ' seconds' + (state?.paused ? ' • paused' : '') : 'Nothing is playing.',allowedMentions:{parse:[]}});
    }},
    { data:int(make('history','Show recent server playback history.'),'count','Number of tracks',1,25,false), async execute(i,{access,database}) {
        await i.deferReply(); await access.check(i.guildId,i.user.id);
        const rows = await database.getHistory(i.guildId,i.options.getInteger('count') || 10);
        await i.editReply({content:rows.length ? rows.map((r,n) => (n+1) + '. ' + r.title).join('\n').slice(0,1900) : 'No playback history yet.',allowedMentions:{parse:[]}});
    }},
    { data:make('rank','Show your server XP and level.').addUserOption(o => o.setName('user').setDescription('Member')),async execute(i,{access,database}) {
        await i.deferReply(); await access.check(i.guildId,i.user.id);
        const user = i.options.getUser('user') || i.user;
        const rank = await database.rank(i.guildId,user.id);
        await i.editReply({content:user.username + ': level ' + rank.level + ', ' + rank.xp + ' XP, rank ' + (rank.rank || 'unranked'),allowedMentions:{parse:[]}});
    }},
    { data:make('leaderboard','Show the top 20 members by server XP.'),async execute(i,{access,database}) {
        await i.deferReply(); await access.check(i.guildId,i.user.id);
        const rows = await database.leaderboard(i.guildId);
        await i.editReply({content:rows.length ? rows.map((r,n) => (n+1) + '. <@' + r.user_id + '> — ' + r.xp + ' XP, level ' + r.level).join('\n') : 'No XP yet.',allowedMentions:{parse:[]}});
    }},
    { data:make('memory-clear','Delete your AI conversation memory in this server.'), async execute(i,{ai}) {
        await i.deferReply({flags:64}); await ai.clear(i.guildId,i.user.id); await i.editReply('Your AI memory was deleted.');
    }}
];
const playlist = make('playlist','Manage your private playlists.');
playlist.addSubcommand(s => string(s.setName('create').setDescription('Create a playlist.'),'name','Playlist name'));
playlist.addSubcommand(s => s.setName('list').setDescription('List your playlists and IDs.'));
for (const action of ['show','delete','load']) playlist.addSubcommand(s => int(s.setName(action).setDescription(action + ' a playlist.'),'id','Playlist ID',1,2147483647));
playlist.addSubcommand(s => string(string(int(s.setName('add').setDescription('Add a track URL.'),'id','Playlist ID',1,2147483647),'url','Track URL'),'title','Track title',false));
playlist.addSubcommand(s => int(int(s.setName('remove').setDescription('Remove a track by its position.'),'id','Playlist ID',1,2147483647),'position','Track position',1,1000000));
commands.push({data:playlist,async execute(i,{access,database,actions}) {
    await i.deferReply({flags:64});
    await access.check(i.guildId,i.user.id);
    const action = i.options.getSubcommand();
    const id = i.options.getInteger('id');
    let result;
    switch(action) {
        case 'create': result = await database.createPlaylist(i.user.id,i.options.getString('name')); break;
        case 'list': result = await database.playlists(i.user.id); break;
        case 'show': result = await database.playlist(i.user.id,id); break;
        case 'delete': await database.deletePlaylist(i.user.id,id); result = 'Playlist deleted.'; break;
        case 'add': result = await database.addPlaylistItem(i.user.id,id,{url:i.options.getString('url'),title:i.options.getString('title')}); break;
        case 'remove': await database.removePlaylistItem(i.user.id,id,i.options.getInteger('position')); result = 'Track removed.'; break;
        case 'load': result = await actions.execute(i.guildId,i.user,'playlist-load',{id}); break;
    }
    await i.editReply({content:typeof result === 'string' ? result : JSON.stringify(result,null,2).slice(0,1900),allowedMentions:{parse:[]}});
}});
export { commands };
