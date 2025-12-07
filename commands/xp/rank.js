const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('[BETA] Mostra seu nível e XP'),
    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const user = await getUser(guildId, userId);

        const xp = user ? user.xp : 0;
        const level = user ? user.level : 1;
        const voiceXp = user ? (user.voice_xp || 0) : 0;
        const messageXp = user ? (user.message_xp || 0) : 0;

        let voicePercent = 0;
        let msgPercent = 0;

        if (xp > 0) {
            voicePercent = Math.round((voiceXp / xp) * 100);
            msgPercent = Math.round((messageXp / xp) * 100);
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`🎖️ Rank de ${interaction.user.username}`)
            .addFields(
                { name: 'Nível', value: `${level}`, inline: true },
                { name: 'XP Total', value: `${xp}`, inline: true },
                { name: '\u200B', value: '\u200B' }, // Spacer
                { name: '🎤 Voz', value: `${voiceXp} XP (${voicePercent}%)`, inline: true },
                { name: '💬 Chat', value: `${messageXp} XP (${msgPercent}%)`, inline: true }
            )
            .setFooter({ text: 'Sistema de Níveis v2.0' });

        await interaction.reply({ embeds: [embed] });
    },
};
