import { commands } from '../commands/registry.js';

// Compare public definitions, ignoring Discord IDs, version numbers and absent defaults.
const definition = command => ({ name:command.name,description:command.description,
    type:command.type || 1,options:(command.options || []).map(option => ({
        ...definition(option),required:option.required || false,
        choices:(option.choices || []).map(choice => ({name:choice.name,value:choice.value})),
        min_value:option.min_value,max_value:option.max_value,min_length:option.min_length,max_length:option.max_length
    })) });

export class CommandHandler {
    constructor(registry = commands) { this.commands = new Map(registry.map(command => [command.data.name,command])); }
    async loadCommands() {
        for (const command of this.commands.values()) command.data.toJSON();
        return [...this.commands.keys()];
    }
    async register(rest,route) {
        const expected = [...this.commands.values()].map(command => command.data.toJSON());
        await rest.put(route,{body:expected});
        const live = await rest.get(route);
        const names = live.map(command => command.name).sort();
        const wanted = expected.map(command => command.name).sort();
        if (JSON.stringify(names) !== JSON.stringify(wanted)) throw new Error('Discord command registry does not match this build');
        for(const command of expected) {
            if(JSON.stringify(definition(command)) !== JSON.stringify(definition(live.find(item => item.name === command.name))))
                throw new Error('Discord command definition does not match this build: ' + command.name);
        }
        return names;
    }
    async handleInteraction(interaction,context) {
        if (interaction.isButton?.() && context.nowPlaying) {
            await context.nowPlaying.handleButton(interaction,context.ready).catch(error => console.error('[NowPlaying]',error.message));
            return;
        }
        if (!interaction.isChatInputCommand()) return;
        if (!interaction.guildId) return interaction.reply({content:'Use commands in a server.',flags:64});
        const command = this.commands.get(interaction.commandName);
        try {
            if (!command) throw Object.assign(new Error('Command is unavailable in this build.'),{status:404});
            if (!context.ready()) throw Object.assign(new Error('Bot dependencies are starting or unavailable. Please retry.'),{status:503});
            await command.execute(interaction,context);
        } catch(error) {
            console.error('[Command]',interaction.commandName,error.message);
            const response = {content:error.status ? error.message : 'Command failed. Check the backend logs.',allowedMentions:{parse:[]}};
            if (interaction.deferred) await interaction.editReply(response).catch(() => {});
            else if (interaction.replied) await interaction.followUp({...response,flags:64}).catch(() => {});
            else await interaction.reply({...response,flags:64}).catch(() => {});
        }
    }
}
export default new CommandHandler();
