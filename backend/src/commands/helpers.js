import { SlashCommandBuilder } from 'discord.js';

export const make = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false);
export const string = (builder, name, description, required = true, max = 1000) => builder.addStringOption(option =>
    option.setName(name).setDescription(description).setRequired(required).setMinLength(1).setMaxLength(max));
export const int = (builder, name, description, min, max, required = true) => builder.addIntegerOption(option =>
    option.setName(name).setDescription(description).setMinValue(min).setMaxValue(max).setRequired(required));
export const reply = content => ({ content, allowedMentions: { parse: [] } });

// Bound each escaped character as a unit, so truncation cannot leave a dangling escape.
export function label(value, max = 140) {
    let result = '';
    for (const character of String(value ?? 'Unknown').replace(/[\r\n\t]/g, ' ')) {
        const escaped = /[\\`*_~|>\[\]()#]/.test(character) ? '\\' + character : character;
        if (result.length + escaped.length > max - 1) return result + '…';
        result += escaped;
    }
    return result;
}

export function lines(items, render, heading = '', footer = '', empty = 'No tracks.') {
    const available = 1900 - heading.length - footer.length - 2;
    const budget = Math.min(140, Math.floor(available / Math.max(1, items.length)) - 32);
    const body = items.length ? items.map((item, index) => render(item, index, budget)).join('\n') : empty;
    return [heading, body, footer].filter(Boolean).join('\n');
}

export function pageOf(items, requested = 1) {
    const pages = Math.max(1, Math.ceil(items.length / 10));
    const page = Math.min(requested || 1, pages);
    const start = (page - 1) * 10;
    return { items: items.slice(start, start + 10), start, footer: `Page ${page}/${pages} • ${items.length} total` };
}
