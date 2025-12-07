const { SlashCommandBuilder } = require('discord.js');
const packageJson = require('../../package.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('Mostra a versão do bot'),
    async execute(interaction) {
        await interaction.reply(`🤖 Bot Version: **v${packageJson.version}**`);
    },
};
