import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NowPlayingService } from '../src/services/nowplaying.js';
import { AiService } from '../src/services/ai.js';
import { ActionService } from '../src/services/actions.js';
import { panelText, panelButtons } from './helpers/nowplaying.js';

const drain = () => new Promise(resolve => setImmediate(resolve));
function fixture(hooks = {}) {
    const player = new EventEmitter();
    let snapshot = { current: { playbackToken: 'first', info: { title: 'Song', length: 3600000 } }, playerState: { position: 0, connected: true }, settings: { volume: 90 }, queue: [] };
    player.getCurrentTrack = () => snapshot.current;
    player.getPlayerState = () => snapshot.playerState;
    player.options = { get: () => snapshot.settings };
    let reads = 0;
    player.snapshot = async (_id, options) => {
        reads++;
        assert.deepEqual(options, { queuePreview: true });
        const result = structuredClone(snapshot);
        if (hooks.beforeSnapshot) await hooks.beforeSnapshot(result);
        return result;
    };
    const sent = [], edits = [], channels = [], controls = [];
    let deleted = false, denied = false, failSend = false, tick, cancelled = false;
    const message = id => ({ id, edit: async () => { throw new Error('Must use bot authentication'); }, channel: { messages: { edit: async (messageId, payload) => { assert.equal(messageId, id); if (deleted) throw Object.assign(new Error('Deleted'), { code: 10008 }); if (hooks.beforeEdit) await hooks.beforeEdit(messageId,payload); edits.push({ id, payload }); } } } });
    const client = { channels: { fetch: async id => {
        channels.push(id);
        return { send: async payload => { if (failSend) throw Object.assign(new Error('Missing permission'), {code:50013}); if (hooks.beforeSend) await hooks.beforeSend(payload); sent.push(payload); return message(String(sent.length)); } };
    } } };
    const service = new NowPlayingService(client, player, { check: async () => { if (denied) throw Object.assign(new Error('Denied'), { status: 403 }); return { channelId: 'voice' }; } }, {
        schedule: (callback, period) => { assert.equal(period, 15000); tick = callback; return 1; }, cancel: () => { cancelled = true; }
    });
    for (const name of ['pause', 'skip', 'stop', 'volume']) player[name] = async (...args) => { controls.push([name, ...args]); return true; };
    return { hooks, client, get reads() { return reads; }, player, service, sent, edits, channels, controls, message, get snapshot() { return snapshot; }, set snapshot(value) { snapshot = value; }, tick: () => tick(), deleted: () => { deleted = true; }, deny: () => { denied = true; }, failSend: () => { failSend = true; }, cancelled: () => cancelled };
}

test('cards follow the original channel, tick at fifteen seconds and retire per playback token', async () => {
    const f = fixture();
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    assert.equal(f.sent.length, 1);
    assert.equal(panelButtons(f.sent[0]).length, 5);
    f.snapshot.playerState.position = 1000000;
    f.player.emit('change', 'g'); await drain();
    assert.equal(f.edits.length, 0);
    f.tick(); await drain();
    assert.match(panelText(f.edits[0].payload), /16:40/);
    f.snapshot.playerState.paused = true; f.player.emit('change', 'g'); await drain();
    assert.equal(panelButtons(f.edits.at(-1).payload)[0].label, 'Retomar');
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'other' }); await drain();
    f.snapshot.current.playbackToken = 'second'; f.player.emit('change', 'g'); await drain();
    assert.deepEqual(f.channels, ['origin']);
    assert.ok(f.edits.some(edit => panelButtons(edit.payload).every(button => button.disabled)));
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
    assert.deepEqual(f.channels, ['origin']);
    await f.service.close();
});

test('streams and disconnected cards retain status and cleanup freezes controls', async () => {
    const f = fixture(); f.snapshot.current.info.isStream = true;
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    assert.ok(panelText(f.sent[0]).includes( '🔴 Ao vivo'));
    f.snapshot.playerState.connected = false; f.player.emit('change', 'g'); await drain();
    assert.match(panelText(f.edits.at(-1).payload), /Desconectado/);
    await f.service.close();
    assert.ok(panelButtons(f.edits.at(-1).payload).every(button => button.disabled));
    f.tick(); await drain(); assert.equal(f.service.sessions.size, 0);
});

test('deleted cards stop updating until next track; send failures suspend only cards', async () => {
    const f = fixture(); f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    f.deleted(); f.snapshot.playerState.position = 15000; f.tick(); await drain(); f.tick(); await drain();
    assert.equal(f.sent.length, 1);
    f.snapshot.current.playbackToken = 'next'; f.player.emit('change', 'g'); await drain();
    assert.equal(f.sent.length, 2);
    await f.service.close();
    const failed = fixture(); failed.failSend(); failed.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    assert.equal(failed.service.sessions.get('g').suspended, true); assert.equal(failed.snapshot.current.playbackToken, 'first');
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

const gate = () => {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    return { promise, release };
};
const start = async f => { f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain(); };

test('ticks skip identical visuals and do not advance the last successfully sent snapshot', async () => {
    const f = fixture(); await start(f);
    f.tick(); await drain(); f.tick(); await drain();
    assert.equal(f.edits.length, 0);
    const card = f.service.sessions.get('g').card;
    f.snapshot.playerState.position = 500;
    f.player.emit('change', 'g'); await drain();
    assert.equal(f.edits.length, 0);
    assert.equal(card.snapshot.playerState.position, 0);
    assert.equal(card.latestSnapshot.playerState.position, 500);
    f.snapshot.playerState.position = 15000; f.tick(); await drain();
    assert.equal(f.edits.length, 1);
    assert.equal(card.snapshot.playerState.position, 15000);
    f.tick(); await drain(); assert.equal(f.edits.length, 1);
    const reads = f.reads;
    f.player.emit('change', 'g', { positionOnly: true }); await drain();
    assert.equal(f.reads, reads);
    await f.service.close();
});

test('pause, resume, volume, filter, queue and connection changes update immediately', async () => {
    const f = fixture(); await start(f);
    const check = async (update, expected) => {
        const before = f.edits.length;
        update(); f.player.emit('change', 'g'); await drain();
        assert.equal(f.edits.length, before + 1);
        assert.match(panelText(f.edits.at(-1).payload), expected);
    };
    await check(() => { f.snapshot.playerState.paused = true; }, /Pausado/);
    assert.equal(panelButtons(f.edits.at(-1).payload)[0].label, 'Retomar');
    await check(() => { f.snapshot.playerState.paused = false; }, /Tocando/);
    assert.equal(panelButtons(f.edits.at(-1).payload)[0].label, 'Pausar');
    await check(() => { f.snapshot.settings.volume = 30; }, /30%/);
    await check(() => { f.snapshot.settings.filter = 'bassboost'; }, /Bass boost/);
    await check(() => { f.snapshot.queue = [{ id: 'next', info: { title: 'Next song', author: 'Next artist' } }]; }, /Next song\nNext artist/);
    await check(() => { f.snapshot.queue = []; }, /Fila vazia/);
    await check(() => { f.snapshot.playerState.connected = false; }, /Desconectado/);
    await f.service.close();
});

test('events arriving during an edit are coalesced, serialized and eventually displayed', async () => {
    const blocked = gate();
    let active = 0, maximum = 0, once = true;
    const f = fixture({ beforeEdit: async () => {
        active++; maximum = Math.max(maximum, active);
        if (once) { once = false; await blocked.promise; }
        active--;
    } });
    await start(f);
    f.snapshot.settings.volume = 20; f.player.emit('change', 'g'); await drain();
    assert.equal(active, 1);
    f.snapshot.settings.volume = 40;
    f.snapshot.playerState.paused = true;
    f.player.emit('change', 'g'); f.tick(); f.player.emit('change', 'g');
    blocked.release(); await drain();
    assert.equal(maximum, 1);
    assert.equal(f.edits.length, 2);
    assert.match(panelText(f.edits.at(-1).payload), /40%/);
    assert.match(panelText(f.edits.at(-1).payload), /Pausado/);
    await f.service.close();
});

test('changes during a snapshot trigger another check instead of being discarded', async () => {
    const blocked = gate(); let once = true;
    const f = fixture(); await start(f);
    f.hooks.beforeSnapshot = async () => { if (once) { once = false; await blocked.promise; } };
    f.snapshot.settings.volume = 20; f.player.emit('change', 'g'); await drain();
    f.snapshot.settings.volume = 35; f.player.emit('change', 'g');
    blocked.release(); await drain();
    assert.match(panelText(f.edits.at(-1).payload), /35%/);
    await f.service.close();
});

test('rapid token changes preserve one message per song and never overwrite a newer panel', async () => {
    const blocked = gate(); let once = true;
    const f = fixture({ beforeSend: async () => { if (once) { once = false; await blocked.promise; } } });
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    for (const token of ['second', 'third']) {
        f.snapshot.current = { playbackToken: token, info: { title: token, length: 100000 } };
        f.player.emit('change', 'g');
    }
    blocked.release(); await drain();
    assert.equal(f.sent.length, 3);
    assert.deepEqual(f.sent.map(payload => panelButtons(payload)[0].custom_id), ['first', 'second', 'third'].map(token => 'np:' + token + ':toggle'));
    assert.ok(panelButtons(f.sent[1]).every(button => button.disabled));
    assert.equal(f.service.sessions.get('g').card.token, 'third');
    assert.ok(f.edits.some(edit => edit.id === '1' && panelButtons(edit.payload).every(button => button.disabled)));
    assert.ok(f.edits.filter(edit => edit.id === '3').every(edit => panelText(edit.payload).includes('third')));
    await f.service.close();
});

test('an old snapshot cannot become the active panel after a token change', async () => {
    const blocked = gate(); let once = true;
    const f = fixture({ beforeSnapshot: async () => { if (once) { once = false; await blocked.promise; } } });
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    f.snapshot.current = { playbackToken: 'second', info: { title: 'Second', length: 100000 } };
    f.player.emit('change', 'g'); blocked.release(); await drain();
    assert.equal(f.sent.length, 2);
    assert.ok(panelButtons(f.sent[0]).every(button => button.disabled));
    assert.equal(f.service.sessions.get('g').card.token, 'second');
    await f.service.close();
});

test('temporary edit errors preserve sent state and retry only on a later request', async () => {
    const f = fixture(); await start(f);
    let attempts = 0;
    f.hooks.beforeEdit = async () => { attempts++; throw Object.assign(new Error('Temporary'), { status: 503 }); };
    const card = f.service.sessions.get('g').card;
    const key = card.visualKey;
    f.snapshot.settings.volume = 25; f.player.emit('change', 'g'); await drain();
    assert.equal(attempts, 1); assert.equal(card.visualKey, key);
    assert.equal(card.snapshot.settings.volume, 90);
    f.hooks.beforeEdit = undefined;
    f.tick(); await drain();
    assert.match(panelText(f.edits.at(-1).payload), /25%/);
    assert.equal(card.snapshot.settings.volume, 25);
    await f.service.close();
});

test('permanent edit failures suspend panels while ambiguous sends are not repeated', async () => {
    const f = fixture(); await start(f);
    let edits = 0;
    f.hooks.beforeEdit = async () => { edits++; throw Object.assign(new Error('Missing access'), { code: 50001 }); };
    f.snapshot.settings.volume = 25; f.player.emit('change', 'g'); await drain();
    f.tick(); await drain(); assert.equal(edits, 1);
    assert.equal(f.service.sessions.get('g').suspended, true);
    f.hooks.beforeEdit = undefined;
    await f.service.close();
    let sends = 0;
    const failed = fixture({ beforeSend: async () => { sends++; throw new Error('Network reset'); } });
    await start(failed); failed.tick(); await drain(); failed.tick(); await drain();
    assert.equal(sends, 1);
    failed.hooks.beforeSend = undefined;
    failed.snapshot.current.playbackToken = 'next'; failed.player.emit('change', 'g'); await drain();
    assert.equal(failed.sent.length, 1);
    await failed.service.close();
});

test('one guild waiting for Discord does not block another guild', async () => {
    const blocked = gate();
    const f = fixture({ beforeEdit: async id => { if (id === '1') await blocked.promise; } });
    await start(f);
    f.player.emit('sessionAccepted', { guildId: 'other', channelId: 'other-channel' }); await drain();
    f.snapshot.settings.volume = 25;
    f.player.emit('change', 'g'); f.player.emit('change', 'other'); await drain();
    assert.ok(f.edits.some(edit => edit.id === '2'));
    assert.equal(f.edits.some(edit => edit.id === '1'), false);
    blocked.release(); await drain(); await f.service.close();
});

test('legacy panels are disabled without V2 conversion and replacement uses a new message', async () => {
    const f = fixture(); await start(f);
    const session = f.service.sessions.get('g');
    session.card.format = 'legacy';
    session.card.message.components = [{ type: 1, components: [{ type: 2, style: 2, label: 'Pausar', custom_id: 'np:first:toggle' }] }];
    f.player.emit('change', 'g'); await drain();
    assert.equal(f.sent.length, 2);
    assert.equal(f.edits[0].id, '1');
    assert.equal('flags' in f.edits[0].payload, false);
    assert.equal('embeds' in f.edits[0].payload, false);
    assert.equal('content' in f.edits[0].payload, false);
    assert.ok(panelButtons(f.edits[0].payload).every(button => button.disabled));
    assert.equal(session.card.message.id, '2');
    await f.service.close();
});

test('close drains in-flight sends, disables their controls and cleans timers and listeners', async () => {
    const blocked = gate();
    const f = fixture({ beforeSend: async () => blocked.promise });
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    const closing = f.service.close();
    f.snapshot.current.playbackToken = 'next'; f.player.emit('change', 'g'); f.tick();
    blocked.release(); await closing;
    assert.equal(f.sent.length, 1);
    assert.ok(panelButtons(f.edits.at(-1).payload).every(button => button.disabled));
    assert.equal(f.service.sessions.size, 0); assert.equal(f.service.pending.size, 0);
    for (const event of ['change', 'sessionAccepted', 'sessionEnded']) assert.equal(f.player.listenerCount(event), 0);
    assert.equal(f.cancelled(), true);
    await f.service.close();
});

test('stop followed by a new session during a send retires the old message in its own channel', async () => {
    const blocked = gate(); let once = true;
    const f = fixture({ beforeSend: async () => { if (once) { once = false; await blocked.promise; } } });
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    f.player.emit('sessionEnded', 'g');
    f.snapshot.current = { playbackToken: 'new-session', info: { title: 'New session', length: 100000 } };
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'new-origin' });
    blocked.release(); await drain();
    assert.equal(f.sent.length, 2);
    assert.deepEqual(f.channels, ['origin', 'new-origin']);
    assert.equal(f.service.sessions.get('g').card.token, 'new-session');
    assert.ok(panelButtons(f.edits.find(edit => edit.id === '1').payload).every(button => button.disabled));
    await f.service.close();
});

test('an empty stale snapshot cannot retire a new track that arrived while reading', async () => {
    const blocked = gate(); let once = true;
    const f = fixture({ beforeSnapshot: async () => { if (once) { once = false; await blocked.promise; } } });
    f.snapshot.current = null;
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    f.snapshot.current = { playbackToken: 'new', info: { title: 'New', length: 100000 } };
    f.player.emit('change', 'g'); blocked.release(); await drain();
    assert.equal(f.sent.length, 1);
    assert.equal(f.service.sessions.get('g').card.token, 'new');
    assert.equal(panelButtons(f.sent[0]).some(button => button.disabled), false);
    await f.service.close();
});

test('a deleted legacy panel is not automatically recreated for the same track', async () => {
    const f = fixture(); await start(f);
    f.service.sessions.get('g').card.format = 'legacy';
    f.deleted(); f.player.emit('change', 'g'); await drain(); f.tick(); await drain();
    assert.equal(f.sent.length, 1);
    assert.equal(f.service.sessions.get('g').deletedToken, 'first');
    await f.service.close();
});

test('button authorization is revalidated after asynchronous access checks', async () => {
    const blocked = gate(); const f = fixture(); await start(f);
    let response;
    f.service.access.check = async () => { await blocked.promise; return { channelId: 'voice' }; };
    const control = f.service.handleButton({ guildId: 'g', user: { id: 'u' }, message: { id: '1' }, customId: 'np:first:skip',
        deferReply: async () => {}, deleteReply: async () => {}, editReply: async payload => { response = payload.content; } }, () => true);
    await drain();
    f.snapshot.current = { playbackToken: 'next', info: { title: 'Next', length: 100000 } };
    f.player.emit('change', 'g'); await drain(); blocked.release(); await control;
    assert.match(response, /expirou/); assert.equal(f.controls.length, 0);
    await f.service.close();
});

test('the periodic interval can be configured without changing the production default', async () => {
    const player = new EventEmitter(); let cancelled = false;
    const service = new NowPlayingService({}, player, {}, { intervalMs: 30000,
        schedule: (_callback, interval) => { assert.equal(interval, 30000); return 1; }, cancel: () => { cancelled = true; } });
    await service.close(); assert.equal(cancelled, true);
    assert.throws(() => new NowPlayingService({}, player, {}, { intervalMs: 0 }), /Invalid NowPlaying interval/);
});

test('a transition captured during a failed send survives until the next tick', async () => {
    const blocked = gate(); let once = true;
    const f = fixture({ beforeSend: async () => {
        if (once) { once = false; await blocked.promise; throw new Error('Network reset'); }
    } });
    f.player.emit('sessionAccepted', { guildId: 'g', channelId: 'origin' }); await drain();
    f.snapshot.current = { playbackToken: 'next', info: { title: 'Next', length: 100000 } };
    f.player.emit('change', 'g'); blocked.release(); await drain();
    assert.equal(f.sent.length, 0);
    f.tick(); await drain();
    assert.equal(f.sent.length, 1);
    assert.equal(f.service.sessions.get('g').card.token, 'next');
    await f.service.close();
});

test('explicit nowplaying can replace a panel in a channel whose permissions were revoked', async () => {
    const f = fixture(); await start(f);
    f.hooks.beforeEdit = async id => { if (id === '1') throw Object.assign(new Error('Missing access'), { code: 50001 }); };
    await f.service.show({ guildId: 'g', editReply: async () => f.message('manual') });
    assert.equal(f.service.sessions.get('g').card.message.id, 'manual');
    let response;
    await f.service.handleButton({ guildId: 'g', user: { id: 'u' }, message: { id: '1' }, customId: 'np:first:skip',
        deferReply: async () => {}, deleteReply: async () => {}, editReply: async payload => { response = payload.content; } }, () => true);
    assert.match(response, /expirou/); assert.equal(f.controls.length, 0);
    await f.service.close();
});
