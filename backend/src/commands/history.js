import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import DatabaseService from '../services/database.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('history')
        .setDescription('Show the last played tracks for this server.')
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of tracks to show (default: 10, max: 25)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
        ),
    async execute(interaction) {
        await interaction.deferReply();

        const guildId = interaction.guildId;
        const count = interaction.options.getInteger('count') || 10;
        const history = await DatabaseService.getHistory(guildId, count);

        if (history.length === 0) {
            return interaction.editReply('📭 No playback history found for this server.');
        }

        const lines = history.map((entry, i) => {
            const time = new Date(entry.played_at).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });
            return `\`${i + 1}.\` **${entry.title}** — <t:${Math.floor(new Date(entry.played_at).getTime() / 1000)}:R>`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('📜 Playback History')
            .setDescription(lines.join('\n'))
            .setFooter({ text: `Showing last ${history.length} track${history.length !== 1 ? 's' : ''}` });

        return interaction.editReply({ embeds: [embed] });
    }
};
