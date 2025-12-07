const { SlashCommandBuilder } = require('discord.js');
const { getSession } = require('../../utils/playerManager');
const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Retoma a música'),
    async execute(interaction) {
        const session = getSession(interaction.guildId);
        if (session.player.state.status === AudioPlayerStatus.Paused) {
            session.player.unpause();
            await interaction.reply('▶️ Retomado.');
        } else {
            await interaction.reply({ content: '❌ A música não está pausada.', ephemeral: true });
        }
    },
};
