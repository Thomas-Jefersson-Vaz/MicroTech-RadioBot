const { SlashCommandBuilder } = require('discord.js');
const { getSession } = require('../../utils/playerManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Para a música, limpa a fila e desconecta'),
    async execute(interaction) {
        const session = getSession(interaction.guildId);
        session.stop();
        await interaction.reply('🛑 Parado e desconectado.');
    },
};
