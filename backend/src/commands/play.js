import { SlashCommandBuilder } from 'discord.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music. Supports multiple URLs (url && url), -s shuffle, -r reverse.')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('URL or search. Use url1 && url2 for multi, -s to shuffle, -r to reverse.')
                .setRequired(true)
        ),
    async execute(interaction, { playerController }) {
        await interaction.deferReply();
        const query = interaction.options.getString('query');

        try {
            const result = await playerController.handlePlay(interaction, query);

            if (result.type === 'empty') {
                return interaction.editReply('❌ No results found.');
            }

            const flagNote = result.flags?.shuffle ? ' 🔀 Shuffled.' : result.flags?.reverse ? ' 🔁 Reversed.' : '';

            if (result.count === 1) {
                const track = result.track;
                return interaction.editReply(`🎶 Added **${track.info.title}** to queue.${flagNote}`);
            }

            // Multiple tracks (playlist, multi-URL, etc.)
            const names = result.playlistNames?.length
                ? result.playlistNames.join(' + ')
                : `${result.count} tracks`;
            return interaction.editReply(`✅ Added **${names}** (${result.count} tracks) to queue.${flagNote}`);

        } catch (error) {
            console.error(error);
            return interaction.editReply(`❌ Error: ${error.message}`);
        }
    }
};
