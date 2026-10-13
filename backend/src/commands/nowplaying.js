import {
    escapeMarkdown, ContainerBuilder, SectionBuilder, ThumbnailBuilder, TextDisplayBuilder,
    SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} from 'discord.js';

const milliseconds = value => Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, value)) : 0;
function label(value, fallback, limit = 200) {
    let result = '';
    for (const character of String(value || fallback).replace(/[\s\u0000-\u001f\u007f]+/g, ' ')) {
        const escaped = character === '@' ? '@\u200b' : /[<>\[\]()#]/.test(character) ? '\\' + character : escapeMarkdown(character);
        if (result.length + escaped.length > limit - 1) return result + '…';
        result += escaped;
    }
    return result;
}
function safeUrl(value) {
    if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
        const encoded = url.href.replace(/[()[\]<>]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
        return encoded.length <= 1024 ? encoded : undefined;
    } catch { return undefined; }
}
export function formatTime(value) {
    const seconds = Math.floor(milliseconds(value) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    return (hours ? hours + ':' + String(minutes).padStart(2, '0') : String(minutes)) + ':' + String(seconds % 60).padStart(2, '0');
}

// Signatures describe bounded, displayed fields, never the complete queue.
export function nowPlayingPresentation(snapshot, { dynamic = false, ended = false, sessionEnded = false } = {}) {
    const { current: track, playerState: state, settings = {}, queue = [] } = snapshot;
    const container = new ContainerBuilder().setAccentColor(0x1abc9c);
    const text = content => new TextDisplayBuilder().setContent(content);
    const payload = { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
    if (!track) {
        container.addTextDisplayComponents(text('Nenhuma música tocando no momento.'));
        const key = JSON.stringify(container.toJSON());
        return { payload, visualKey: key, semanticKey: key };
    }
    const info = track.info || {};
    const duration = milliseconds(state?.duration) || milliseconds(info.length);
    const position = duration ? Math.min(milliseconds(state?.position), duration) : milliseconds(state?.position);
    const status = ended ? '⏹️ Encerrado' : state?.connected === false ? '🔌 Desconectado' : state?.paused ? '⏸️ Pausado' : '▶️ Tocando';
    const url = safeUrl(info.uri) || safeUrl(track.url);
    const artwork = safeUrl(info.artworkUrl);
    const title = label(info.title, 'Música sem título', 256);
    const heading = '## 🎶 ' + (ended ? 'Reprodução encerrada' : 'Tocando agora') + '\n**' + (url ? `[${title}](${url})` : title) + '**';
    const artist = label(info.author, 'Artista desconhecido') + '\n' + status;
    if (artwork) container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(heading), text(artist))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(artwork)));
    else container.addTextDisplayComponents(text(heading), text(artist));

    let progress = '`' + formatTime(position) + '` / duração desconhecida';
    if (info.isStream) progress = '🔴 Ao vivo';
    else if (duration) {
        const index = Math.floor(position / duration * 11);
        progress = '━'.repeat(index) + '●' + '─'.repeat(11 - index) + '\n`' + formatTime(position) + ' / ' + formatTime(duration) + '`';
    }
    const filters = { reset: 'Desativado', bassboost: 'Bass boost', nightcore: 'Nightcore', vaporwave: 'Vaporwave' };
    const count = snapshot.queueLength ?? queue.length;
    const details = '**Pedido por:** ' + label(track.requester?.username, 'Desconhecido') + '\n**Volume:** ' +
        (Number.isFinite(settings.volume) ? settings.volume + '%' : 'Desconhecido') + ' • **Filtro:** ' +
        label(filters[settings.filter] || settings.filter, 'Desativado') + '\n**Na fila:** ' + count + (count === 1 ? ' música' : ' músicas');
    const next = '**Próxima música**\n' + (queue[0] ? label(queue[0].info?.title, 'Música sem título') + '\n' +
        label(queue[0].info?.author, 'Artista desconhecido') : 'Fila vazia');
    const footer = ended ? (sessionEnded ? 'Sessão encerrada' : 'Reprodução encerrada') + ' • Controles desativados' :
        dynamic ? 'Progresso atualizado periodicamente • /nowplaying para atualizar' : 'Progresso no momento da consulta • /nowplaying para atualizar';
    container.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(text(progress), text(details))
        .addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(text(next), text('-# ' + footer));
    if (dynamic && track.playbackToken) {
        const buttons = [['toggle', state?.paused ? 'Retomar' : 'Pausar'], ['skip', 'Pular'], ['down', 'Volume −'], ['up', 'Volume +'], ['stop', 'Parar']];
        container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons.map(([action, name]) => new ButtonBuilder()
            .setCustomId('np:' + track.playbackToken + ':' + action).setLabel(name)
            .setStyle(action === 'stop' ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(ended))));
    }
    return { payload, visualKey: JSON.stringify(container.toJSON()), semanticKey: JSON.stringify([
        track.playbackToken, heading, artist, artwork, details, next, footer, duration, Boolean(info.isStream), Boolean(state?.paused), ended
    ]) };
}
export function nowPlayingReply(snapshot, options) { return nowPlayingPresentation(snapshot, options).payload; }
