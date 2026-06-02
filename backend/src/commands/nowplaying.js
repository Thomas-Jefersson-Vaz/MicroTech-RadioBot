import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing track with progress.'),
    async execute(interaction, { playerController }) {
        const guildId = interaction.guildId;
        const state = playerController.getPlayerState(guildId);
        const currentTrack = playerController.getCurrentTrack(guildId);

        if (!currentTrack) {
            return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
        }

        const info = currentTrack.info;
        const position = state?.position || 0;
        const duration = info.length || 0;

        // Build progress bar
        const barLength = 20;
        const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
        const filled = Math.round(barLength * progress);
        const bar = '▓'.repeat(filled) + '░'.repeat(barLength - filled);

        const embed = new EmbedBuilder()
            .setColor(0x7C3AED)
            .setTitle('🎶 Now Playing')
            .setDescription(`**[${info.title}](${info.uri})**`)
            .addFields(
                { name: 'Artist', value: info.author || 'Unknown', inline: true },
                { name: 'Source', value: info.sourceName || 'Unknown', inline: true },
                { name: 'Requested by', value: currentTrack.requester?.username || 'Unknown', inline: true },
                { name: 'Progress', value: `\`${formatDuration(position)}\` ${bar} \`${formatDuration(duration)}\``, inline: false },
            );

        if (info.artworkUrl) {
            embed.setThumbnail(info.artworkUrl);
        }

        if (state?.paused) {
            embed.setFooter({ text: '⏸️ Paused' });
        }

        return interaction.reply({ embeds: [embed] });
    }
};

function formatDuration(ms) {
    if (!ms || ms <= 0) return '0:00';
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
