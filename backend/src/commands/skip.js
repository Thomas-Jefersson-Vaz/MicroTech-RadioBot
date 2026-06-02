import { SlashCommandBuilder } from 'discord.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track.'),
    async execute(interaction, { playerController }) {
        const guildId = interaction.guildId;
        const success = await playerController.skip(guildId);

        if (!success) {
            return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
        }

        return interaction.reply('⏭️ Skipped the current track.');
    }
};
