import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NowPlayingService } from '../src/services/nowplaying.js';
import { AiService } from '../src/services/ai.js';
import { ActionService } from '../src/services/actions.js';

const drain = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
    const player = new EventEmitter();
    let snapshot = { current: { playbackToken: 'first', info: { title: 'Song', length: 3600000 } }, playerState: { position: 0, connected: true }, settings: { volume: 90 }, queue: [] };
    player.snapshot = async () => structuredClone(snapshot);
    const sent = [], edits = [], channels = [], controls = [];
    let deleted = false, denied = false, failSend = false, tick, cancelled = false;
    const message = id => ({ id, edit: async () => { throw new Error('Must use bot authentication'); }, channel: { messages: { edit: async (messageId, payload) => { assert.equal(messageId, id); if (deleted) throw Object.assign(new Error('Deleted'), { code: 10008 }); edits.push({ id, payload }); } } } });
    const client = { channels: { fetch: async id => {
        channels.push(id);
        return { send: async payload => { if (failSend) throw new Error('Missing permission'); sent.push(payload); return message(String(sent.length)); } };
    } } };
    const service = new NowPlayingService(client, player, { check: async () => { if (denied) throw Object.assign(new Error('Denied'), { status: 403 }); return { channelId: 'voice' }; } }, {
        schedule: (callback, period) => { assert.equal(period, 5000); tick = callback; return 1; }, cancel: () => { cancelled = true; }
    });
    for (const name of ['pause', 'skip', 'stop', 'volume']) player[name] = async (...args) => { controls.push([name, ...args]); return true; };
    return { player, service, sent, edits, channels, controls, message, get snapshot() { return snapshot; }, set snapshot(value) { snapshot = value; }, tick: () => tick(), deleted: () => { deleted = true; }, deny: () => { denied = true; }, failSend: () => { failSend = true; }, cancelled: () => cancelled };
}

test('cards follow the original channel, tick at five seconds and retire per playback token', async () => {
    const f = fixture();
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].components[0].toJSON().components.length, 5);
    f.snapshot.playerState.position = 1000000;
    f.player.emit('change', 'g'); await drain();
    assert.equal(f.edits.length, 0);
    f.tick(); await drain();
    assert.match(f.edits[0].payload.embeds[0].toJSON().fields[0].value, /16:40/);
    f.snapshot.playerState.paused = true; f.player.emit('change', 'g'); await drain();
    assert.equal(f.edits.at(-1).payload.components[0].toJSON().components[0].label, 'Retomar');
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'other' }); await drain();
    f.snapshot.current.playbackToken = 'second'; f.player.emit('change', 'g'); await drain();
    assert.deepEqual(f.channels, ['origin', 'origin']);
    assert.ok(f.edits.some(edit => edit.payload.components[0].toJSON().components.every(button => button.disabled)));
    f.snapshot.current = null; f.player.emit('change', 'g'); await drain();
    assert.equal(f.service.sessions.size, 0);
    await f.service.close(); assert.equal(f.cancelled(), true);
    assert.equal(f.player.listenerCount('change'), 0);
});

test('manual card replaces active message without changing automatic channel', async () => {
    const f = fixture(); f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    await f.service.show({ guildId: 'g', editReply: async () => f.message('manual') });
    assert.equal(f.service.sessions.get('g').card.message.id, 'manual');
    f.snapshot.current.playbackToken = 'next'; f.player.emit('change', 'g'); await drain();
    assert.deepEqual(f.channels, ['origin', 'origin']);
    await f.service.close();
});

test('streams and disconnected cards retain status and cleanup freezes controls', async () => {
    const f = fixture(); f.snapshot.current.info.isStream = true;
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    assert.equal(f.sent[0].embeds[0].toJSON().fields[0].value, '🔴 Ao vivo');
    f.snapshot.playerState.connected = false; f.player.emit('change', 'g'); await drain();
    assert.match(f.edits.at(-1).payload.embeds[0].toJSON().fields[0].name, /Desconectado/);
    await f.service.close();
    assert.ok(f.edits.at(-1).payload.components[0].toJSON().components.every(button => button.disabled));
    f.tick(); await drain(); assert.equal(f.service.sessions.size, 0);
});

test('deleted cards stop updating until next track; send failures suspend only cards', async () => {
    const f = fixture(); f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    f.deleted(); f.tick(); await drain(); f.tick(); await drain();
    assert.equal(f.sent.length, 1);
    f.snapshot.current.playbackToken = 'next'; f.player.emit('change', 'g'); await drain();
    assert.equal(f.sent.length, 2);
    await f.service.close();
    const failed = fixture(); failed.failSend(); failed.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    assert.equal(failed.service.sessions.size, 0); assert.equal(failed.snapshot.current.playbackToken, 'first');
    await failed.service.close();
});

test('button controls check permissions and reject obsolete messages', async () => {
    const f = fixture(); f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    let response;
    const interaction = action => ({ guildId: 'g', user: { id: 'u' }, message: { id: '1' }, customId: 'np:first:' + action,
        deferReply: async payload => assert.equal(payload.flags, 64), deleteReply: async () => {}, editReply: async payload => { response = payload.content; } });
    for (const action of ['toggle', 'skip', 'up', 'down', 'stop']) await f.service.handleButton(interaction(action), () => true);
    assert.deepEqual(f.controls.map(control => control[0]), ['pause', 'skip', 'volume', 'volume', 'stop']);
    assert.equal(f.controls[0].at(-1), 'first'); assert.deepEqual(f.controls[2].slice(-3), [10, 'first', true]);
    const stale = interaction('skip'); stale.message.id = 'old';
    await f.service.handleButton(stale, () => true); assert.match(response, /expirou/);
    f.deny(); await f.service.handleButton(interaction('skip'), () => true); assert.equal(response, 'Denied');
    assert.equal(f.controls.length, 5);
    f.player.emit('sessionEnded', 'g'); await drain(); assert.equal(f.service.sessions.size, 0);
    await f.service.close();
});

test('AI and playlist actions propagate trusted originating channel', async () => {
    let received;
    const ai = new AiService({ memories: async () => [], saveMemories: async () => {} }, { access: { check: async () => {} }, execute: async (...args) => { received = args; return {}; } }, { settings: { geminiKey: 'test', geminiModel: 'test' } });
    ai.generate = async () => ({ reply: 'OK', action: { name: 'play', args: { query: 'song' } } });
    await ai.respond('g', { id: 'u' }, 'play song', { textChannelId: 'origin' });
    assert.deepEqual(received.at(-1), { textChannelId: 'origin' });
    const actions = new ActionService({ enqueueTracks: async (...args) => { received = args; return {}; } }, { playlist: async () => ({ items: [{ url: 'https://example.com' }] }) }, { check: async () => ({ channelId: 'voice' }) });
    await actions.execute('g', { id: 'u' }, 'playlist-load', { id: 1 }, { textChannelId: 'origin' });
    assert.equal(received.at(-1), 'origin');
});
