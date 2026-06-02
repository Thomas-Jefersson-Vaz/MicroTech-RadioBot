import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CommandHandler {
    constructor() {
        this.commands = new Map();
    }

    async loadCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        if (!fs.existsSync(commandsPath)) {
            console.warn('[CommandLoader] Commands folder not found:', commandsPath);
            return;
        }

        const files = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        console.log(`[CommandLoader] Found ${files.length} command files.`);

        for (const file of files) {
            const filePath = `file://${path.join(commandsPath, file).replace(/\\/g, '/')}`;
            try {
                const module = await import(filePath);
                const command = module.command; // We exported 'command' object
                if (command && command.data) {
                    this.commands.set(command.data.name, command);
                    console.log(`[CommandLoader] Loaded: /${command.data.name}`);
                } else {
                    console.warn(`[CommandLoader] ${file} does not export a valid command object.`);
                }
            } catch (e) {
                console.error(`[CommandLoader] Failed to load ${file}:`, e);
            }
        }
    }

    async handleInteraction(interaction, context) {
        if (!interaction.isChatInputCommand()) return;

        const command = this.commands.get(interaction.commandName);
        if (!command) {
            console.warn(`[CommandHandler] Unknown command: ${interaction.commandName}`);
            return;
        }

        try {
            console.log(`[CommandHandler] Executing /${interaction.commandName} by ${interaction.user.tag}`);
            await command.execute(interaction, context);
        } catch (error) {
            console.error(`[CommandHandler] Error in /${interaction.commandName}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '❌ Internal Error executing command.', ephemeral: true }).catch(() => { });
            } else {
                await interaction.reply({ content: '❌ Internal Error executing command.', ephemeral: true }).catch(() => { });
            }
        }
    }
}

export default new CommandHandler();
