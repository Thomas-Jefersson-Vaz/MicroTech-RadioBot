import { make } from './helpers.js';
import { musicCommands } from './music.js';
import { xpCommands } from './xp.js';
import { playlistCommand } from './playlists.js';

export const commands = [
    ...musicCommands,
    ...xpCommands,
    { data:make('memory-clear','Delete your AI conversation memory in this server.'), async execute(i,{ai}) {
        await i.deferReply({flags:64}); await ai.clear(i.guildId,i.user.id); await i.editReply('Your AI memory was deleted.');
    }},
    playlistCommand
];
