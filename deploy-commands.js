require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    if (fs.lstatSync(commandsPath).isDirectory()) {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Use applicationCommands() for global registration
        // Or applicationGuildCommands(clientId, guildId) for instant update on one server
        // Using global for production readiness, though it takes ~1h to cache.
        // For specific guild debugging, add GUILD_ID to .env and use Routes.applicationGuildCommands

        const clientId = process.env.CLIENT_ID; // Need to ensure CLIENT_ID is in .env or fetched
        // Since we don't have CLIENT_ID in .env initially, we might need the user to add it.
        // But we can try to fetch it from the token? No, REST needs it.
        // I will assume the user has it or I can get it from the client object if I ran index methods, but this script is standalone.

        // Fallback: If CLIENT_ID is missing, this script will fail. 
        // I should create a .env.example or ask user.
        // However, for now, let's assume it exists or use a placeholder.
        if (!clientId) {
            console.error("Missing CLIENT_ID in .env");
            process.exit(1);
        }

        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
