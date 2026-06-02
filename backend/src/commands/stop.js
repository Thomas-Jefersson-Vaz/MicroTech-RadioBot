import { SlashCommandBuilder } from 'discord.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback, clear the queue, and leave the voice channel.'),
    async execute(interaction, { playerController }) {
        const guildId = interaction.guildId;
        const success = await playerController.stop(guildId);

        if (!success) {
            return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
        }

        return interaction.reply('⏹️ Stopped playback and cleared the queue.');
    }
};
