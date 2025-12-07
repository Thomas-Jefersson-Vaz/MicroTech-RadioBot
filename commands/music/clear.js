const { SlashCommandBuilder } = require('discord.js');
const { getSession } = require('../../utils/playerManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Limpa a fila de reprodução'),
    async execute(interaction) {
        const session = getSession(interaction.guildId);
        session.queue = [];
        await interaction.reply('🗑️ Fila limpa!');
    },
};
