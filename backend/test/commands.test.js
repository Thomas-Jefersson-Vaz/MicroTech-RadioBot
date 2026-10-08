import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/commands/registry.js';
import { CommandHandler } from '../src/handlers/commandHandler.js';
import { ActionService } from '../src/services/actions.js';
import { webUrl } from '../src/utils/validation.js';

const command = name => commands.find(item => item.data.name === name);
function interaction(values = {}) {
    return {
        guildId: 'guild', channelId: 'text', user: { id: 'user', username: 'User' },
        options: { getString: key => values[key] ?? null, getInteger: key => values[key] ?? null,
            getUser: key => values[key] ?? null, getSubcommand: () => values.action },
        async deferReply(options) { this.deferred = options || {}; },
        async editReply(response) { this.response = response; }
    };
}
const access = { check: async () => ({ channelId: 'voice' }) };

test('music commands forward arguments and report concrete results without mentions', async () => {
    const cases = [
        ['play', { query: 'song' }, { query: 'song', textChannelId: 'text' }, /Added 3/],
        ['pause', {}, { toggle: true }, /paused/],
        ['volume', { value: 42 }, { value: 42 }, /42%/],
        ['filter', { preset: 'nightcore' }, { preset: 'nightcore' }, /nightcore/],
        ['jump', { position: 2 }, { position: 2 }, /track 2/],
        ['move', { from: 2, to: 3 }, { from: 2, to: 3 }, /2 to 3/],
        ...['resume', 'skip', 'stop', 'clear', 'shuffle'].map(name => [name, {}, {}, /./])
    ];
    for (const [name, values, args, message] of cases) {
        const i = interaction(values);
        await command(name).execute(i, { actions: { execute: async (...actual) => {
            assert.deepEqual(actual, ['guild', i.user, name, args]);
            return { count: 3, paused: true };
        } } });
        assert.match(i.response.content, message);
        assert.deepEqual(i.response.allowedMentions, { parse: [] });
    }
    const i = interaction();
    await command('pause').execute(i, { actions: { execute: async () => ({ paused: false }) } });
    assert.match(i.response.content, /resumed/);
});

test('pause action supports toggle while ordinary pause and resume remain compatible', async () => {
    const calls = [];
    const actions = new ActionService({ pause: async (...args) => { calls.push(args); return { paused: true }; } }, {}, access);
    assert.deepEqual(await actions.execute('guild', { id: 'user' }, 'pause', { toggle: true }), { success: true, paused: true });
    await actions.execute('guild', { id: 'user' }, 'pause');
    await actions.execute('guild', { id: 'user' }, 'resume');
    assert.deepEqual(calls, [['guild', 'toggle', 'voice'], ['guild', true, 'voice'], ['guild', false, 'voice']]);
});

test('playlist subcommands preserve ownership, privacy and argument forwarding', async () => {
    const cases = [
        ['create', { name: 'Mix' }, 'createPlaylist', ['user', 'Mix'], { id: 7, name: 'Mix' }, /ID 7/],
        ['list', {}, 'playlists', ['user'], [], /No playlists/],
        ['show', { id: 7 }, 'playlist', ['user', 7], { id: 7, name: 'Mix', items: [] }, /empty/],
        ['delete', { id: 7 }, 'deletePlaylist', ['user', 7], undefined, /deleted/],
        ['add', { id: 7, url: 'https://example.com', title: 'Song' }, 'addPlaylistItem', ['user', 7, { url: 'https://example.com', title: 'Song' }], { title: 'Song', position: 4 }, /position 4/],
        ['remove', { id: 7, position: 4 }, 'removePlaylistItem', ['user', 7, 4], undefined, /removed/]
    ];
    for (const [action, values, method, args, result, message] of cases) {
        const i = interaction({ action, ...values });
        await command('playlist').execute(i, { access, database: { [method]: async (...actual) => {
            assert.deepEqual(actual, args); return result;
        } } });
        assert.deepEqual(i.deferred, { flags: 64 });
        assert.match(i.response.content, message);
        assert.deepEqual(i.response.allowedMentions, { parse: [] });
    }
    const i = interaction({ action: 'load', id: 7 });
    await command('playlist').execute(i, { access, actions: { execute: async (...args) => {
        assert.deepEqual(args, ['guild', i.user, 'playlist-load', { id: 7 }, { textChannelId: 'text' }]);
        return { count: 12 };
    } } });
    assert.match(i.response.content, /Added 12/);
});

test('queue and playlists paginate and preserve positions and footer with long metadata', async () => {
    const title = '*Long* <@123>\n' + '`'.repeat(2000);
    const entries = Array.from({ length: 21 }, (_, n) => ({ id: n + 1, position: n + 1, title, name: title, count: 2, info: { title } }));
    for (const [name, values, context] of [
        ['queue', { page: 2 }, { playerController: { snapshot: async () => ({ current: entries[0], queue: entries }) } }],
        ['playlist', { action: 'show', id: 7, page: 2 }, { database: { playlist: async () => ({ id: 7, name: title, items: entries }) } }],
        ['playlist', { action: 'list', page: 2 }, { database: { playlists: async () => entries } }]
    ]) {
        const i = interaction(values);
        await command(name).execute(i, { access, ...context });
        assert.ok(i.response.content.length <= 1900);
        assert.match(i.response.content, /Page 2\/3/);
        assert.match(i.response.content, /(?:11\.|ID 11:)/);
        assert.match(i.response.content, /(?:20\.|ID 20:)/);
        assert.ok(i.response.content.includes('\\*Long\\*'));
        assert.deepEqual(i.response.allowedMentions, { parse: [] });
        const last = interaction({ ...values, page: 999 });
        await command(name).execute(last, { access, ...context });
        assert.match(last.response.content, /Page 3\/3/);
    }
    const empty = interaction();
    await command('queue').execute(empty, { access, playerController: { snapshot: async () => ({ queue: [] }) } });
    assert.match(empty.response.content, /No upcoming tracks/);
    assert.match(empty.response.content, /Page 1\/1/);
});

test('history preserves all 25 entries with long titles', async () => {
    const i = interaction({ count: 25 });
    await command('history').execute(i, { access, database: { getHistory: async (...args) => {
        assert.deepEqual(args, ['guild', 25]);
        return Array.from({ length: 25 }, () => ({ title: '*'.repeat(2000) }));
    } } });
    assert.ok(i.response.content.length <= 1900);
    assert.equal(i.response.content.split('\n').length, 25);
    assert.match(i.response.content, /25\./);
});

test('read and playlist commands stop on denied access before calling services', async () => {
    const denied = { check: async () => { throw Object.assign(new Error('Denied'), { status: 403 }); } };
    for (const name of ['queue', 'history', 'rank', 'leaderboard', 'nowplaying', 'playlist']) {
        const i = interaction({ action: 'create' });
        await assert.rejects(command(name).execute(i, { access: denied }), { status: 403 });
        assert.equal(i.response, undefined);
    }
    const actions = new ActionService({ pause: () => assert.fail('Must not pause') }, {}, denied);
    await assert.rejects(actions.execute('guild', { id: 'user' }, 'pause', { toggle: true }), { status: 403 });
});

test('registry declares service text limits and rejects duplicate names', () => {
    assert.equal(command('play').data.toJSON().options[0].max_length, 2000);
    const options = command('playlist').data.toJSON().options;
    assert.equal(options.find(o => o.name === 'create').options[0].max_length, 100);
    const add = options.find(o => o.name === 'add').options;
    assert.equal(add.find(o => o.name === 'url').max_length, 2048);
    assert.equal(add.find(o => o.name === 'title').max_length, 300);
    assert.throws(() => new CommandHandler([command('play'), command('play')]), /Duplicate command name: play/);
});

test('malformed URLs return validation errors', () => {
    for (const value of ['not a URL', 'https://', 'ftp://example.com']) assert.throws(() => webUrl(value), { status: 400 });
    assert.equal(webUrl('https://example.com'), 'https://example.com/');
});

test('XP commands and memory clear use the requested user and guild', async () => {
    const target = { id: 'target', username: '*Target*' };
    const rank = interaction({ user: target });
    await command('rank').execute(rank, { access, database: { rank: async (...args) => {
        assert.deepEqual(args, ['guild', 'target']); return { level: 2, xp: 400, rank: 1 };
    } } });
    assert.match(rank.response.content, /level 2, 400 XP, rank 1/);
    const leaderboard = interaction();
    await command('leaderboard').execute(leaderboard, { access, database: { leaderboard: async id => {
        assert.equal(id, 'guild'); return [{ user_id: 'target', xp: 400, level: 2 }];
    } } });
    assert.deepEqual(leaderboard.response.allowedMentions, { parse: [] });
    const memory = interaction();
    await command('memory-clear').execute(memory, { ai: { clear: async (...args) => assert.deepEqual(args, ['guild', 'user']) } });
    assert.deepEqual(memory.deferred, { flags: 64 });
    assert.match(memory.response, /deleted/);
});

test('handler reports command validation failure instead of success', async () => {
    const i = interaction({ value: 50 });
    Object.assign(i, { commandName: 'volume', isChatInputCommand: () => true });
    await new CommandHandler().handleInteraction(i, { ready: () => true, actions: { execute: async () => {
        throw Object.assign(new Error('Denied'), { status: 403 });
    } } });
    assert.equal(i.response.content, 'Denied');
    assert.deepEqual(i.response.allowedMentions, { parse: [] });
});
