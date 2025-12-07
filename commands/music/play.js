const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { getSession } = require('../../utils/playerManager');
const { resolveSpotifyTrack } = require('../../utils/spotifyResolver');
const { ytDlpWrap } = require('../../utils/playerManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Toca uma música do YouTube ou Link do Spotify')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL da música ou termo de busca')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const url = interaction.options.getString('url');
        const guildId = interaction.guildId;
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply('❌ Você precisa estar em um canal de voz!');
        }

        const session = getSession(guildId);

        // Connect if not connected
        if (!session.connection) {
            try {
                await session.connect(voiceChannel);
            } catch (error) {
                console.error(error);
                return interaction.editReply('❌ Não consegui entrar no canal de voz.');
            }
        }

        let searchUrl = url;

        // Spotify Handling
        if (url.includes('spotify.com') && url.includes('/track/')) {
            await interaction.editReply('🔎 Processando link do Spotify...');
            const spotifyTerm = await resolveSpotifyTrack(url);
            if (spotifyTerm) {
                searchUrl = `ytsearch1:${spotifyTerm} Official Audio`;
            } else {
                return interaction.editReply('❌ Falha ao processar link do Spotify.');
            }
        } else if (!url.startsWith('http')) {
            // Text query: Default to ytsearch
            searchUrl = `ytsearch1:${url}`;
        }

        try {
            // Get Metadata
            const metadata = await ytDlpWrap.execPromise([searchUrl, '--dump-single-json', '--flat-playlist']);
            const info = JSON.parse(metadata);

            let songsToAdd = [];

            // Playlist handling
            if (info._type === 'playlist' && info.entries) {
                for (const entry of info.entries) {
                    songsToAdd.push({
                        title: entry.title,
                        url: entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`, // FIX: Use original URL, not resolved direct stream
                        duration: entry.duration,
                        requestedBy: member.id
                    });
                }
                await interaction.editReply(`✅ Adicionadas **${songsToAdd.length}** músicas da playlist **${info.title}** à fila.`);
            } else {
                // Single Video (or Search Result)
                const entry = info.entries ? info.entries[0] : info;

                songsToAdd.push({
                    title: entry.title,
                    url: entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`, // FIX: Use original URL, not resolved direct stream
                    duration: entry.duration,
                    requestedBy: member.id
                });

                if (session.currentSong) {
                    await interaction.editReply(`✅ Adicionado à fila: **${entry.title}**`);
                } else {
                    await interaction.editReply(`🎶 Tocando: **${entry.title}**`);
                }
            }

            // Add to queue
            for (const song of songsToAdd) {
                session.queue.push(song);
            }

            // Start if not playing
            if (!session.currentSong) {
                session.notificationsChannel = interaction.channel;
                session.processQueue();
            }

        } catch (error) {
            console.error(error);
            return interaction.editReply('❌ Erro ao buscar/tocar a música. Verifique o link.');
        }
    },
};
