const { SlashCommandBuilder } = require('discord.js');
const { getSession } = require('../../utils/playerManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Pula a música atual'),
    async execute(interaction) {
        const session = getSession(interaction.guildId);
        if (session.currentSong) {
            session.player.stop(); // Triggers idle -> next song
            await interaction.reply('⏭️ Pulando...');
        } else {
            await interaction.reply({ content: '❌ Nada tocando.', ephemeral: true });
        }
    },
};
