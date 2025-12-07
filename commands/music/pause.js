const { SlashCommandBuilder } = require('discord.js');
const { getSession } = require('../../utils/playerManager');
const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pausa a música'),
    async execute(interaction) {
        const session = getSession(interaction.guildId);
        if (session.player.state.status === AudioPlayerStatus.Playing) {
            session.player.pause();
            await interaction.reply('⏸️ Pausado.');
        } else {
            await interaction.reply({ content: '❌ Não estou tocando nada.', ephemeral: true });
        }
    },
};
