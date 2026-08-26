import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import createLogger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('CommandLoader');
const logHandler = createLogger('CommandHandler');

class CommandHandler {
    constructor() {
        this.commands = new Map();
    }

    /**
     * Recursively collects all .js files from a directory tree.
     */
    _collectCommandFiles(dir) {
        const results = [];
        if (!fs.existsSync(dir)) return results;

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...this._collectCommandFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                results.push(fullPath);
            }
        }
        return results;
    }

    /**
     * Loads all command modules from the commands directory (recursively).
     * Returns an array of successfully loaded command names.
     */
    async loadCommands() {
        const commandsPath = path.join(__dirname, '../commands');
        if (!fs.existsSync(commandsPath)) {
            log.warn('Commands folder not found:', commandsPath);
            return [];
        }

        const filePaths = this._collectCommandFiles(commandsPath);
        log.info(`Found ${filePaths.length} command file(s) (recursive scan).`);

        const loaded = [];

        for (const absolutePath of filePaths) {
            const relativeName = path.relative(commandsPath, absolutePath);
            const fileUrl = `file://${absolutePath.replace(/\\/g, '/')}`;
            try {
                const module = await import(fileUrl);
                const command = module.command;
                if (command && command.data) {
                    this.commands.set(command.data.name, command);
                    loaded.push(command.data.name);
                    log.debug(`Loaded: /${command.data.name} (from ${relativeName})`);
                } else {
                    log.warn(`${relativeName} does not export a valid command object.`);
                }
            } catch (e) {
                log.error(`Failed to load ${relativeName}:`, e);
            }
        }

        if (loaded.length > 0) {
            log.info(`Successfully loaded ${loaded.length} command(s): ${loaded.join(', ')}`);
        } else {
            log.warn('No commands were successfully loaded.');
        }

        return loaded;
    }

    async handleInteraction(interaction, context) {
        if (!interaction.isChatInputCommand()) return;

        const command = this.commands.get(interaction.commandName);
        if (!command) {
            logHandler.warn(`Unknown command: /${interaction.commandName}`);
            return;
        }

        try {
            logHandler.debug(`Executing /${interaction.commandName} by ${interaction.user.tag}`);
            await command.execute(interaction, context);
        } catch (error) {
            logHandler.error(`Error in /${interaction.commandName}:`, error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '❌ Internal Error executing command.', ephemeral: true }).catch(() => { });
            } else {
                await interaction.reply({ content: '❌ Internal Error executing command.', ephemeral: true }).catch(() => { });
            }
        }
    }
}

export default new CommandHandler();
