import test from 'node:test';
import assert from 'node:assert/strict';
import { nowPlayingReply, formatTime } from '../src/commands/nowplaying.js';
import { commands } from '../src/commands/registry.js';

const fixture = () => ({
    current: { info: { title: 'Uma música', author: 'Artista', uri: 'https://example.com/song', artworkUrl: 'https://example.com/cover.png', length: 193000 }, requester: { username: 'Maria' } },
    playerState: { position: 19000, duration: 193000, connected: true, paused: false },
    settings: { volume: 75, filter: 'nightcore' },
    queue: [{ info: { title: 'Outra música', author: 'Outro artista' } }]
});
const embed = snapshot => nowPlayingReply(snapshot).embeds[0].toJSON();

test('nowplaying includes artwork, link, progress and playback details', () => {
    const card = embed(fixture());
    assert.equal(card.url, 'https://example.com/song');
    assert.equal(card.thumbnail.url, 'https://example.com/cover.png');
    assert.match(card.fields[0].value, /0:19 \/ 3:13/);
    for (const value of ['Maria', '75%', 'Nightcore', '1 música']) assert.ok(card.fields.some(field => field.value === value));
    assert.match(card.fields.at(-1).value, /Outra música\nOutro artista/);
});
test('paused, disconnected and live playback have explicit states', () => {
    const snapshot = fixture();
    snapshot.playerState.paused = true;
    assert.match(embed(snapshot).fields[0].name, /Pausado/);
    snapshot.playerState.connected = false;
    assert.match(embed(snapshot).fields[0].name, /Desconectado/);
    snapshot.current.info.isStream = true;
    assert.equal(embed(snapshot).fields[0].value, '🔴 Ao vivo');
});
test('missing metadata, invalid URLs and empty queues remain valid', () => {
    const card = embed({ current: { info: { uri: 'javascript:alert(1)', artworkUrl: 'file:///cover.png' } } });
    assert.equal(card.title, 'Música sem título');
    assert.equal(card.description, 'Artista desconhecido');
    assert.equal(card.url, undefined);
    assert.equal(card.thumbnail, undefined);
    assert.match(card.fields[0].value, /duração desconhecida/);
    assert.equal(card.fields.at(-1).value, 'Fila vazia');
    assert.equal(nowPlayingReply({ current: null }).content, 'Nenhuma música tocando no momento.');
});
test('times handle hours, invalid values, duration fallback and clamping', () => {
    assert.equal(formatTime(3661000), '1:01:01');
    for (const value of [-10, NaN, Infinity, undefined]) assert.equal(formatTime(value), '0:00');
    const snapshot = fixture();
    snapshot.playerState.duration = 0;
    snapshot.playerState.position = 999999;
    assert.match(embed(snapshot).fields[0].value, /3:13 \/ 3:13/);
});
test('long metadata stays within Discord embed limits', () => {
    const snapshot = fixture();
    snapshot.current.info.title = '*'.repeat(5000);
    snapshot.current.info.author = 'a'.repeat(5000);
    snapshot.current.requester.username = 'u'.repeat(5000);
    snapshot.queue[0].info.title = 'q'.repeat(5000);
    const card = embed(snapshot);
    assert.ok(card.title.length <= 256);
    assert.ok(card.description.length <= 4096);
    assert.ok(card.fields.every(field => field.value.length <= 1024));
});
test('command defers, checks access and sends snapshot embed without mentions', async () => {
    const calls = [];
    const command = commands.find(command => command.data.name === 'nowplaying');
    await command.execute({ guildId: 'guild', user: { id: 'user' }, deferReply: async () => calls.push('defer'), editReply: async payload => {
        calls.push('reply');
        assert.deepEqual(payload.allowedMentions, { parse: [] });
        assert.equal(payload.embeds[0].toJSON().title, 'Uma música');
    } }, { access: { check: async (guild, user) => { assert.equal(guild, 'guild'); assert.equal(user, 'user'); calls.push('access'); } }, playerController: { snapshot: async () => { calls.push('snapshot'); return fixture(); } } });
    assert.deepEqual(calls, ['defer', 'access', 'snapshot', 'reply']);
});
