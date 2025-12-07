const { SlashCommandBuilder } = require('discord.js');
const { getSession } = require('../../utils/playerManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('[BETA] Aplica filtros de áudio (Bassboost, Nightcore, etc)')
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Tipo de filtro')
                .setRequired(true)
                .addChoices(
                    { name: 'Desativar Todos', value: 'off' },
                    { name: 'Bassboost (Suave)', value: 'bass=g=5:f=100:w=0.6' }, // Tuned down from 15dB
                    { name: 'Nightcore', value: 'asetrate=48000*1.25,aresample=48000' },
                    { name: 'Slowed + Reverb', value: 'asetrate=48000*0.8,aresample=48000,aecho=0.8:0.5:1000:0.2' },
                    { name: '8D', value: 'apulsator=hz=0.125' }
                ))
        .addBooleanOption(option =>
            option.setName('manter_fila')
                .setDescription('Manter o filtro para as próximas músicas? (Padrão: Não)')
                .setRequired(false)),
    async execute(interaction) {
        const filterValue = interaction.options.getString('tipo');
        const persist = interaction.options.getBoolean('manter_fila') || false;
        const session = getSession(interaction.guildId);

        if (filterValue === 'off') {
            session.applyFilter('off', false);
            await interaction.reply('✨ Filtros desativados. Recarregando áudio...');
        } else {
            session.applyFilter(filterValue, persist);
            const msg = persist ? `🎚️ Filtro aplicado e **mantido para a fila**!` : `🎚️ Filtro aplicado (apenas esta música).`;
            await interaction.reply(`${msg} Recarregando áudio...`);
        }
    },
};
