import { make, label } from './helpers.js';

export const xpCommands = [
    { data:make('rank','Show your server XP and level.').addUserOption(o => o.setName('user').setDescription('Member')),async execute(i,{access,database}) {
        await i.deferReply(); await access.check(i.guildId,i.user.id);
        const user = i.options.getUser('user') || i.user;
        const rank = await database.rank(i.guildId,user.id);
        await i.editReply({content:label(user.username) + ': level ' + rank.level + ', ' + rank.xp + ' XP, rank ' + (rank.rank || 'unranked'),allowedMentions:{parse:[]}});
    }},
    { data:make('leaderboard','Show the top 20 members by server XP.'),async execute(i,{access,database}) {
        await i.deferReply(); await access.check(i.guildId,i.user.id);
        const rows = await database.leaderboard(i.guildId);
        await i.editReply({content:rows.length ? rows.map((r,n) => (n+1) + '. <@' + r.user_id + '> — ' + r.xp + ' XP, level ' + r.level).join('\n') : 'No XP yet.',allowedMentions:{parse:[]}});
    }},
];
