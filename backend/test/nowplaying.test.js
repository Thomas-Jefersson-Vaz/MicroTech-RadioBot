import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags, ButtonStyle } from 'discord.js';
import { nowPlayingReply, nowPlayingPresentation, formatTime } from '../src/commands/nowplaying.js';
import { commands } from '../src/commands/registry.js';
import { components, panelText, panelButtons } from './helpers/nowplaying.js';

const fixture = () => ({
    current: { playbackToken: 'token', info: { title: 'Uma música', author: 'Artista', uri: 'https://example.com/song', artworkUrl: 'https://example.com/cover.png', length: 193000 }, requester: { username: 'Maria' } },
    playerState: { position: 19000, duration: 193000, connected: true, paused: false },
    settings: { volume: 75, filter: 'nightcore' },
    queue: [{ info: { title: 'Outra música', author: 'Outro artista' } }]
});

test('V2 panel includes artwork, linked title, progress, details and functional buttons', () => {
    const payload = nowPlayingReply(fixture(), { dynamic: true });
    const text = panelText(payload);
    assert.equal(payload.flags, MessageFlags.IsComponentsV2);
    assert.equal('content' in payload, false);
    assert.equal('embeds' in payload, false);
    assert.equal(payload.components[0].toJSON().accent_color, 0x1abc9c);
    assert.match(text, /\[Uma música]\(https:\/\/example.com\/song\)/);
    assert.equal(components(payload).find(item => item.type === 11).media.url, 'https://example.com/cover.png');
    assert.match(text, /0:19 \/ 3:13/);
    for (const value of ['Maria', '75%', 'Nightcore', '1 música', 'Outra música\nOutro artista']) assert.ok(text.includes(value));
    const buttons = panelButtons(payload);
    assert.deepEqual(buttons.map(button => button.custom_id), ['toggle', 'skip', 'down', 'up', 'stop'].map(action => 'np:token:' + action));
    assert.equal(buttons.at(-1).style, ButtonStyle.Danger);
    assert.ok(buttons.every(button => !button.disabled));
});

test('paused, disconnected and live playback have explicit states and stable ticks', () => {
    const snapshot = fixture();
    snapshot.playerState.paused = true;
    assert.match(panelText(nowPlayingReply(snapshot)), /Pausado/);
    assert.equal(panelButtons(nowPlayingReply(snapshot, { dynamic: true }))[0].label, 'Retomar');
    snapshot.playerState.connected = false;
    assert.match(panelText(nowPlayingReply(snapshot)), /Desconectado/);
    snapshot.current.info.isStream = true;
    const first = nowPlayingPresentation(snapshot);
    assert.match(panelText(first.payload), /🔴 Ao vivo/);
    assert.doesNotMatch(panelText(first.payload), /NaN|Infinity|●/);
    snapshot.playerState.position += 15000;
    assert.equal(nowPlayingPresentation(snapshot).visualKey, first.visualKey);
});

test('missing metadata, invalid URLs and empty queues remain valid', () => {
    const payload = nowPlayingReply({ current: { info: { uri: 'javascript:alert(1)', artworkUrl: 'file:///cover.png' } } });
    const text = panelText(payload);
    assert.match(text, /Música sem título/);
    assert.match(text, /Artista desconhecido/);
    assert.match(text, /duração desconhecida/);
    assert.match(text, /Fila vazia/);
    assert.equal(components(payload).some(item => item.type === 9 || item.type === 11), false);
    assert.equal(panelText(nowPlayingReply({ current: null })), 'Nenhuma música tocando no momento.');
});

test('times handle hours, invalid values, duration fallback and fixed-width progress clamping', () => {
    assert.equal(formatTime(3661000), '1:01:01');
    for (const value of [-10, NaN, Infinity, undefined]) assert.equal(formatTime(value), '0:00');
    const snapshot = fixture();
    snapshot.playerState.duration = 0;
    for (const position of [0, 50000, 193000, 999999]) {
        snapshot.playerState.position = position;
        const text = panelText(nowPlayingReply(snapshot));
        assert.equal(text.match(/[━●─]+/)[0].length, 12);
        assert.equal(text.match(/[━●─]+/)[0].split('●').length, 2);
    }
    assert.match(panelText(nowPlayingReply(snapshot)), /3:13 \/ 3:13/);
});

test('malicious metadata and large queues stay within V2 limits without scanning the queue', () => {
    const snapshot = fixture();
    snapshot.current.info.title = '*](https://evil.test) @everyone\n# attack' + '*'.repeat(5000);
    snapshot.current.info.author = '`'.repeat(5000);
    snapshot.current.requester.username = '<@123>' + 'u'.repeat(5000);
    snapshot.queue[0].info.title = 'q'.repeat(5000);
    snapshot.queue[0].info.author = 'a'.repeat(5000);
    snapshot.current.info.uri = 'https://example.com/song(x)[y]';
    snapshot.queue.length = 10000;
    Object.defineProperty(snapshot.queue, 1, { get() { assert.fail('Must not inspect the second track'); } });
    const payload = nowPlayingReply(snapshot, { dynamic: true });
    const text = panelText(payload);
    assert.ok(text.length < 4000);
    assert.ok(components(payload).length <= 40);
    assert.ok(Buffer.byteLength(JSON.stringify(payload.components.map(item => item.toJSON()))) < 12000);
    assert.match(text, /10000 músicas/);
    assert.ok(text.includes('\\*\\]'));
    assert.ok(text.includes('@\u200beveryone'));
    assert.ok(text.includes('%28x%29%5By%5D'));
    for (const uri of ['https://user:pass@example.com', 'https://example.com/' + 'x'.repeat(2000), 'https://example.com/\n']) {
        snapshot.current.info.uri = uri;
        assert.equal(panelText(nowPlayingReply(snapshot)).includes('](https://example.com'), false);
    }
});

test('ended panels preserve details, disable controls and retain the project color', () => {
    const payload = nowPlayingReply(fixture(), { dynamic: true, ended: true, sessionEnded: true });
    assert.match(panelText(payload), /Uma música/);
    assert.match(panelText(payload), /Sessão encerrada/);
    assert.ok(panelButtons(payload).every(button => button.disabled));
    assert.equal(payload.components[0].toJSON().accent_color, 0x1abc9c);
});

test('command defers without V2, checks access and requests compact snapshot before V2 edit', async () => {
    const calls = [];
    const command = commands.find(command => command.data.name === 'nowplaying');
    await command.execute({ guildId: 'guild', user: { id: 'user' }, deferReply: async options => { assert.equal(options, undefined); calls.push('defer'); }, editReply: async payload => {
        calls.push('reply');
        assert.deepEqual(payload.allowedMentions, { parse: [] });
        assert.match(panelText(payload), /Uma música/);
        assert.equal(payload.flags, MessageFlags.IsComponentsV2);
    } }, { access: { check: async (guild, user) => { assert.equal(guild, 'guild'); assert.equal(user, 'user'); calls.push('access'); } }, playerController: { snapshot: async (id, options) => {
        assert.equal(id, 'guild'); assert.deepEqual(options, { queuePreview: true }); calls.push('snapshot'); return fixture();
    } } });
    assert.deepEqual(calls, ['defer', 'access', 'snapshot', 'reply']);
});
