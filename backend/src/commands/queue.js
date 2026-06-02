import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import QueueService from '../services/queue.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue.')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number (10 tracks per page)')
                .setRequired(false)
                .setMinValue(1)
        ),
    async execute(interaction, { playerController }) {
        const guildId = interaction.guildId;
        const page = interaction.options.getInteger('page') || 1;
        const perPage = 10;

        const queue = await QueueService.getQueue(guildId);
        const currentTrack = playerController.getCurrentTrack(guildId);

        if (!currentTrack && queue.length === 0) {
            return interaction.reply({ content: '📭 The queue is empty. Use `/play` to add songs!', ephemeral: true });
        }

        const totalPages = Math.max(1, Math.ceil(queue.length / perPage));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * perPage;
        const pageItems = queue.slice(start, start + perPage);

        const embed = new EmbedBuilder()
            .setColor(0x7C3AED) // Purple
            .setTitle('🎶 Music Queue')
            .setFooter({ text: `Page ${safePage}/${totalPages} • ${queue.length} track${queue.length !== 1 ? 's' : ''} in queue` });

        // Now Playing
        if (currentTrack) {
            const info = currentTrack.info;
            const duration = formatDuration(info.length);
            embed.addFields({
                name: '🔊 Now Playing',
                value: `**[${info.title}](${info.uri})** — ${info.author} \`${duration}\``,
                inline: false,
            });
        }

        // Queue list
        if (pageItems.length > 0) {
            const lines = pageItems.map((track, i) => {
                const pos = start + i + 1;
                const info = track.info;
                const duration = formatDuration(info.length);
                return `\`${pos}.\` **${info.title}** — ${info.author} \`${duration}\``;
            });

            embed.addFields({
                name: 'Up Next',
                value: lines.join('\n'),
                inline: false,
            });
        } else if (queue.length === 0 && currentTrack) {
            embed.addFields({
                name: 'Up Next',
                value: '*No more tracks in queue.*',
                inline: false,
            });
        }

        return interaction.reply({ embeds: [embed] });
    }
};

function formatDuration(ms) {
    if (!ms || ms <= 0) return 'LIVE';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
        return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
