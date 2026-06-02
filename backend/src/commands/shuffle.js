import { SlashCommandBuilder } from 'discord.js';
import QueueService from '../services/queue.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the current queue.'),
    async execute(interaction, { playerController }) {
        const guildId = interaction.guildId;
        const queue = await QueueService.getQueue(guildId);

        if (queue.length < 2) {
            return interaction.reply({ content: '❌ Not enough tracks in the queue to shuffle.', ephemeral: true });
        }

        await QueueService.shuffle(guildId);
        return interaction.reply(`🔀 Shuffled **${queue.length}** tracks in the queue.`);
    }
};
