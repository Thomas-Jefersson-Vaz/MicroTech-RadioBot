import { SlashCommandBuilder } from 'discord.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause or resume the current track (toggles).'),
    async execute(interaction, { playerController }) {
        const guildId = interaction.guildId;
        const state = playerController.getPlayerState(guildId);

        if (!state) {
            return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
        }

        const isPaused = state.paused;
        const success = await playerController.pause(guildId, !isPaused);

        if (!success) {
            return interaction.reply({ content: '❌ Failed to toggle pause.', ephemeral: true });
        }

        return interaction.reply(isPaused ? '▶️ Resumed playback.' : '⏸️ Paused playback.');
    }
};
