const { Events } = require('discord.js');
const { addXp } = require('../utils/db');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        const userId = message.author.id;
        const guildId = message.guild.id;

        // Ensure user exists
        await require('../utils/db').createUser(guildId, userId, message.author.username);

        // Logic: 1 XP per character
        const charCount = message.content.length;
        const xpAmount = charCount > 0 ? charCount : 1; // Minimum 1 XP

        await addXp(guildId, userId, xpAmount, 'message');
    },
};
