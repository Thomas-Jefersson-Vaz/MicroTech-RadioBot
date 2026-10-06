import {writeFile,readFile} from 'node:fs/promises';
import {commands} from '../src/commands/registry.js';
const rows=commands.map(command => {
    const data=command.data.toJSON();
    const options=(data.options || []).map(option => option.type === 1 ? option.name : '<'+option.name+(option.required ? '' : '?')+'>').join(', ');
    return '| /'+data.name+' | '+options+' | '+data.description+' |';
}).sort();
const content='# Discord command reference\n\nGenerated from the command registry using `npm run docs:commands` in backend.\n\n| Command | Options/subcommands | Behavior |\n|---|---|---|\n'+rows.join('\n')+'\n\nMusic controls require the bot’s voice channel, with a guild-administrator override.\nPlaylist ownership is private to the requester. Queue positions refer to upcoming tracks, starting at 1.\n';
const destination=new URL('../../docs/commands.md',import.meta.url);
if(process.argv.includes('--check')) {
    if(await readFile(destination,'utf8') !== content)throw new Error('Command documentation is stale; run npm run docs:commands');
} else await writeFile(destination,content);
