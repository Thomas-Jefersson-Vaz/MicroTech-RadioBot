const { SlashCommandBuilder } = require('discord.js');
const { getSession } = require('../../utils/playerManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Ajusta o volume do bot (0-100)')
        .addIntegerOption(option =>
            option.setName('nivel')
                .setDescription('Volume em %')
                .setMinValue(0)
                .setMaxValue(100)
                .setRequired(true)),
    async execute(interaction) {
        const volume = interaction.options.getInteger('nivel');
        const session = getSession(interaction.guildId);

        session.volume = volume;
        if (session.player.state.resource && session.player.state.resource.volume) {
            session.player.state.resource.volume.setVolumeLogarithmic(volume / 100);
        }

        await interaction.reply(`🔊 Volume ajustado para **${volume}%**.`);
    },
};
