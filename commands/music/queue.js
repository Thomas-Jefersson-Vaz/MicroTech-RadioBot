const { SlashCommandBuilder } = require('discord.js');
const { getSession } = require('../../utils/playerManager');
const { formatTime } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Mostra a fila de músicas'),
    async execute(interaction) {
        const session = getSession(interaction.guildId);
        const queue = session.queue;
        const current = session.currentSong;

        if (!current && queue.length === 0) {
            return interaction.reply('A fila está vazia.');
        }

        let msg = `**🎶 Tocando Agora:**\n${current ? `[${current.title}](${current.url})` : 'Nada'}\n\n`;

        if (queue.length > 0) {
            msg += `**➡️ Próximas músicas:**\n`;
            queue.slice(0, 10).forEach((song, i) => {
                msg += `${i + 1}. ${song.title} (${formatTime(song.duration)})\n`;
            });
            if (queue.length > 10) {
                msg += `... e mais ${queue.length - 10} músicas.`;
            }
        }

        await interaction.reply(msg);
    },
};
