const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[Command Error] ${interaction.commandName}:`, error);

            // Ignore "Unknown interaction" or "Already acknowledged" errors as we can't do anything about them
            if (error.code === 10062 || error.code === 40060) return;

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            } catch (err) {
                console.error("[Error Handler] Failed to send error message:", err.message);
            }
        }
    },
};
