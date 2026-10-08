import { nowPlayingReply } from './nowplaying.js';
import { make, string, int, reply, label, lines, pageOf } from './helpers.js';

function confirmation(action, args, result) {
    switch (action) {
        case 'play': return `Added ${result.count} track(s).`;
        case 'pause': return result.paused ? 'Playback paused.' : 'Playback resumed.';
        case 'resume': return 'Playback resumed.';
        case 'volume': return `Volume set to ${args.value}%.`;
        case 'filter': return `Audio filter set to ${args.preset}.`;
        case 'jump': return `Started upcoming track ${args.position}.`;
        case 'move': return `Moved upcoming track ${args.from} to ${args.to}.`;
        case 'skip': return 'Skipped the current track.';
        case 'stop': return 'Playback stopped, upcoming tracks cleared and voice disconnected.';
        case 'clear': return 'Upcoming tracks cleared.';
        case 'shuffle': return 'Upcoming tracks shuffled.';
    }
}
const music = (data,action,args = () => ({})) => ({
    data,
    async execute(interaction,{actions}) {
        await interaction.deferReply();
        const parameters = args(interaction);
        const result = await actions.execute(interaction.guildId,interaction.user,action,parameters);
        await interaction.editReply(reply(confirmation(action, parameters, result)));
    }
});
export const musicCommands = [
    music(string(make('play','Play a song, URL or playlist; supports &&, -s and -r.'),'query','Song, URL or playlist',true,2000),'play',i => ({query:i.options.getString('query'),textChannelId:i.channelId})),
    music(make('resume','Resume playback or retry the retained queue.'),'resume'),
    music(make('skip','Skip the current track.'),'skip'),
    music(make('stop','Stop playback, clear upcoming tracks and leave voice.'),'stop'),
    music(make('clear','Clear upcoming tracks, keeping the current song.'),'clear'),
    music(make('shuffle','Shuffle upcoming tracks.'),'shuffle'),
    music(int(make('volume','Set and save server volume (0–100).'),'value','Volume',0,100),'volume',i => ({value:i.options.getInteger('value')})),
    music(int(make('jump','Start an upcoming track, discarding preceding entries.'),'position','Upcoming queue position',1,1000000),'jump',i => ({position:i.options.getInteger('position')})),
    music(int(int(make('move','Move an upcoming track to another position.'),'from','Current upcoming position',1,1000000),'to','New upcoming position',1,1000000),'move',i => ({from:i.options.getInteger('from'),to:i.options.getInteger('to')})),
    music(make('filter','Replace the audio filter preset.').addStringOption(o => o.setName('preset').setDescription('Audio preset').setRequired(true).addChoices(...['reset','bassboost','nightcore','vaporwave'].map(name => ({name,value:name})))),'filter',i => ({preset:i.options.getString('preset')})),
    music(make('pause','Toggle pause and resume.'),'pause',() => ({toggle:true})),
    { data:int(make('queue','Show upcoming tracks (10 per page).'),'page','Page',1,1000000,false), async execute(i,{access,playerController}) {
        await i.deferReply();
        await access.check(i.guildId,i.user.id);
        const snapshot = await playerController.snapshot(i.guildId);
        const page = pageOf(snapshot.queue,i.options.getInteger('page'));
        const heading = snapshot.current ? 'Now playing: ' + label(snapshot.current.info?.title) : '';
        await i.editReply(reply(lines(page.items,(track,index,budget) =>
            `${page.start+index+1}. ${label(track.info?.title,budget)}`,heading,page.footer,'No upcoming tracks.')));
    }},
    { data:make('nowplaying','Show the current song and actual playback position.'), async execute(i,{access,playerController,nowPlaying}) {
        await i.deferReply(); await access.check(i.guildId,i.user.id);
        if (nowPlaying) await nowPlaying.show(i);
        else await i.editReply(nowPlayingReply(await playerController.snapshot(i.guildId)));
    }},
    { data:int(make('history','Show recent server playback history.'),'count','Number of tracks',1,25,false), async execute(i,{access,database}) {
        await i.deferReply(); await access.check(i.guildId,i.user.id);
        const rows = await database.getHistory(i.guildId,i.options.getInteger('count') || 10);
        await i.editReply(reply(lines(rows,(row,index,budget) => `${index+1}. ${label(row.title,budget)}`,'','', 'No playback history yet.')));
    }},
];
