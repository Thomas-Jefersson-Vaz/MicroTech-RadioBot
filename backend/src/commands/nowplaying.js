import { EmbedBuilder, escapeMarkdown, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const clip = (value, limit) => String(value).slice(0, limit);
const label = (value, fallback, limit = 200) => clip(escapeMarkdown(String(value || fallback)), limit);
const milliseconds = value => Number.isFinite(value) ? Math.max(0, value) : 0;
function safeUrl(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
    } catch { return undefined; }
}
export function formatTime(value) {
    const seconds = Math.floor(milliseconds(value) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    return (hours ? hours + ':' + String(minutes).padStart(2, '0') : String(minutes)) + ':' + String(seconds % 60).padStart(2, '0');
}

export function nowPlayingReply(snapshot, { dynamic = false, ended = false } = {}) {
    const { current: track, playerState: state, settings = {}, queue = [] } = snapshot;
    const allowedMentions = { parse: [] };
    if (!track) return { content: 'Nenhuma música tocando no momento.', embeds: [], components: [], allowedMentions };
    const info = track.info || {};
    const duration = milliseconds(state?.duration) || milliseconds(info.length);
    const position = duration ? Math.min(milliseconds(state?.position), duration) : milliseconds(state?.position);
    const status = state?.connected === false ? '🔌 Desconectado' : state?.paused ? '⏸️ Pausado' : '▶️ Tocando';
    let progress = formatTime(position) + ' / duração desconhecida';
    if (info.isStream) progress = '🔴 Ao vivo';
    else if (duration) {
        const filled = Math.floor(position / duration * 12);
        progress = '━'.repeat(filled) + '●' + '─'.repeat(12 - filled) + '\n`' + formatTime(position) + ' / ' + formatTime(duration) + '`';
    }
    const filters = { reset: 'Desativado', bassboost: 'Bass boost', nightcore: 'Nightcore', vaporwave: 'Vaporwave' };
    const embed = new EmbedBuilder()
        .setColor(0x1abc9c)
        .setAuthor({ name: '🎶 Tocando agora' })
        .setTitle(label(info.title, 'Música sem título', 256))
        .setDescription(label(info.author, 'Artista desconhecido'))
        .addFields(
            { name: status, value: progress },
            { name: 'Pedido por', value: label(track.requester?.username, 'Desconhecido'), inline: true },
            { name: 'Volume', value: Number.isFinite(settings.volume) ? settings.volume + '%' : 'Desconhecido', inline: true },
            { name: 'Filtro', value: label(filters[settings.filter] || settings.filter, 'Desativado'), inline: true },
            { name: 'Na fila', value: queue.length + (queue.length === 1 ? ' música' : ' músicas'), inline: true },
            { name: 'Próxima música', value: queue.length ? label(queue[0].info?.title, 'Música sem título') + '\n' + label(queue[0].info?.author, 'Artista desconhecido') : 'Fila vazia' }
        )
        .setFooter({ text: 'Progresso no momento da consulta • /nowplaying para atualizar' });
    const url = safeUrl(info.uri || track.url);
    const artwork = safeUrl(info.artworkUrl);
    if (url) embed.setURL(url);
    if (artwork) embed.setThumbnail(artwork);
    const components = [];
    if (dynamic && track.playbackToken) {
        embed.setFooter({ text: ended ? 'Reprodução encerrada • Controles desativados' : 'Atualizado a cada 5 segundos' });
        if (ended) embed.setAuthor({ name: '🎶 Reprodução encerrada' }).setColor(0x747f8d);
        const buttons = [['toggle', state?.paused ? 'Retomar' : 'Pausar'], ['skip', 'Pular'], ['down', 'Volume −'], ['up', 'Volume +'], ['stop', 'Parar']];
        components.push(new ActionRowBuilder().addComponents(buttons.map(([action, name]) => new ButtonBuilder()
            .setCustomId('np:' + track.playbackToken + ':' + action).setLabel(name)
            .setStyle(action === 'stop' ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(ended))));
    }
    return { content: '', embeds: [embed], components, allowedMentions };
}
