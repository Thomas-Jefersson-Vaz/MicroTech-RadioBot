const { Events, ActivityType, REST, Routes } = require('discord.js');
const { initDb } = require('../utils/db');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag} `);

        // Initialize Database
        await initDb();

        client.user.setActivity('v2.0.0 | /help', { type: ActivityType.Playing });

        // Auto-deploy commands
        const commands = client.commands.map(cmd => cmd.data.toJSON());
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);

        try {
            console.log(`Started refreshing ${commands.length} application(/) commands.`);
            const data = await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
            console.log(`Successfully reloaded ${data.length} application (/) commands.`);

            console.log('\n--- 🤖 System Information ---');
            console.log(`Node Version: ${process.version}`);
            console.log(`OS: ${process.platform} (${process.arch})`);
            console.log(`Bot Version: v2.0.0`);
            console.log(`\n--- 📜 Loaded Commands ---`);
            client.commands.forEach((cmd) => {
                console.log(`- /${cmd.data.name}: ${cmd.data.description}`);
            });
            console.log('-----------------------------\n');

        } catch (error) {
            console.error('Error deploying commands:', error);
        }
    },
};