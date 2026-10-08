import {writeFile,readFile} from 'node:fs/promises';
import {commands} from '../src/commands/registry.js';
const rows=commands.map(command => {
    const data=command.data.toJSON();
    const options=(data.options || []).map(option => option.type === 1 ? option.name : '<'+option.name+(option.required ? '' : '?')+'>').join(', ');
    return '| /'+data.name+' | '+options+' | '+data.description+' |';
}).sort();
const content='# Discord command reference\n\nGenerated from the command registry using `npm run docs:commands` in backend.\n\n| Command | Options/subcommands | Behavior |\n|---|---|---|\n'+rows.join('\n')+'\n\nMusic controls require the bot’s voice channel, with a guild-administrator override.\nPlaylist ownership is private to the requester. Queue positions refer to upcoming tracks, starting at 1.\n';
const nowPlayingDocs = '\nNow playing cards update every five seconds and include pause/resume, skip, volume −/＋ (10-point steps), and stop controls. Stop clears the queue and disconnects voice. Controls use the same voice-channel permissions as music commands.\n\nPlayback started through `/play`, `/playlist load`, or an AI request automatically posts a card in the originating channel for each new track. Adding tracks does not change that channel. `/nowplaying` replaces the active card in the requesting channel without changing where subsequent automatic cards appear. Only one card per server remains active; previous cards freeze with disabled controls when replaced or when their track ends.\n\nCard sessions end when playback is stopped or the queue finishes, and are not restored after a bot restart. Old controls then require a fresh `/nowplaying` query.\n';
const documentation = content + nowPlayingDocs;
const destination=new URL('../../docs/commands.md',import.meta.url);
if(process.argv.includes('--check')) {
    if(await readFile(destination,'utf8') !== documentation)throw new Error('Command documentation is stale; run npm run docs:commands');
} else await writeFile(destination,documentation);
