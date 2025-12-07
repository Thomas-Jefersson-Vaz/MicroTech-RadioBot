const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getHistory } = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('[BETA] Mostra as últimas 10 músicas tocadas'),
    async execute(interaction) {
        try {
            const history = await getHistory(interaction.guildId);

            if (!history || history.length === 0) {
                return interaction.reply('📭 Histórico vazio.');
            }

            let description = '';
            history.forEach((entry, i) => {
                const date = new Date(entry.played_at).toLocaleTimeString();
                // Truncate title if too long to save space
                const title = entry.title.length > 50 ? entry.title.substring(0, 47) + '...' : entry.title;
                description += `${i + 1}. [${title}](${entry.url}) - <@${entry.requested_by}> (${date})\n`;
            });

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('📜 Histórico Recente')
                .setDescription(description)
                .setFooter({ text: 'Últimas 10 músicas' });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('History Command Error:', error);
            await interaction.reply('❌ Erro ao buscar histórico.');
        }
    },
};
