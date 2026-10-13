import test from 'node:test';
import assert from 'node:assert/strict';
import { QueueService } from '../src/services/queue.js';

test('queue summary uses an atomic count/head transaction without reading the complete list', async () => {
    const calls = [];
    const head = { id: 'first', info: { title: 'First' } };
    const transaction = {
        lLen(key) { calls.push(['length', key]); return this; },
        lIndex(key, index) { calls.push(['head', key, index]); return this; },
        async exec() { calls.push(['exec']); return [10000, JSON.stringify(head)]; }
    };
    const queue = new QueueService({ multi: () => transaction, lRange: () => assert.fail('Must not read all tracks') });
    assert.deepEqual(await queue.summary('guild'), { length: 10000, head });
    assert.deepEqual(calls, [['length', 'queue:guild'], ['head', 'queue:guild', 0], ['exec']]);
    transaction.exec = async () => [0, null];
    assert.deepEqual(await queue.summary('guild'), { length: 0, head: null });
});
