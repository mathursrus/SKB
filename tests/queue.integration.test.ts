// Integration tests for src/services/queue.ts against real MongoDB.
// Requires Mongo reachable at MONGODB_URI (default mongodb://localhost:27017).
// Writes to a dedicated test DB, cleans up after each test.

import { test } from 'node:test';
import assert from 'node:assert';

// Force a dedicated integration-test DB name. `determineDatabaseName()` reads
// this env lazily inside getDb(), so static imports are fine.
process.env.MONGODB_DB_NAME = 'skb_integration_test';
process.env.FRAIM_BRANCH = ''; // bypass branch-based naming

import { closeDb, getDb, queueEntries, settings } from '../src/core/db/mongo.js';
import {
    getQueueState,
    joinQueue,
    getStatusByCode,
    listHostQueue,
    removeFromQueue,
    callParty,
} from '../src/services/queue.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
}

test('join: empty queue → position 1, promised time = now + avg_turn_time', async () => {
    await resetDb();
    const now = new Date('2026-04-05T20:00:00Z');
    const r = await joinQueue({ name: 'Alice', partySize: 2 }, now);
    assert.strictEqual(r.position, 1);
    assert.strictEqual(r.etaMinutes, 8); // default avg=8
    assert.strictEqual(r.etaAt, '2026-04-05T20:08:00.000Z');
    assert.match(r.code, /^SKB-[A-Z2-9]{3}$/);
});

test('join 3 parties: positions increment; each has fixed promisedEtaAt', async () => {
    await resetDb();
    const base = new Date('2026-04-05T20:00:00Z').getTime();
    const r1 = await joinQueue({ name: 'A', partySize: 2 }, new Date(base));
    const r2 = await joinQueue({ name: 'B', partySize: 3 }, new Date(base + 1000));
    const r3 = await joinQueue({ name: 'C', partySize: 4 }, new Date(base + 2000));
    assert.deepStrictEqual(
        [r1.position, r2.position, r3.position],
        [1, 2, 3],
    );
    assert.deepStrictEqual(
        [r1.etaMinutes, r2.etaMinutes, r3.etaMinutes],
        [8, 16, 24],
    );
});

test('status: promised time never changes; live etaMinutes reflects current position', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    const join = await joinQueue({ name: 'Diner', partySize: 2 }, t0);
    const promisedAtJoin = join.etaAt;

    // 5 minutes later: nothing has changed in the queue
    const t5 = new Date(t0.getTime() + 5 * 60_000);
    const status5 = await getStatusByCode(join.code, t5);
    assert.strictEqual(status5.etaAt, promisedAtJoin, 'promisedEtaAt must not slide');
    assert.strictEqual(status5.etaMinutes, 8, 'live eta = position 1 × 8');

    // 20 minutes later, still same position
    const t20 = new Date(t0.getTime() + 20 * 60_000);
    const status20 = await getStatusByCode(join.code, t20);
    assert.strictEqual(status20.etaAt, promisedAtJoin, 'still the original promise');
});

test('remove: positions recompute for remaining parties', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    const j1 = await joinQueue({ name: 'A', partySize: 2 }, new Date(t0.getTime()));
    const j2 = await joinQueue({ name: 'B', partySize: 2 }, new Date(t0.getTime() + 1000));
    const j3 = await joinQueue({ name: 'C', partySize: 2 }, new Date(t0.getTime() + 2000));

    // find B's id
    const list = await listHostQueue(t0);
    const bId = list.parties.find(p => p.name === 'B')!.id;

    await removeFromQueue(bId, 'seated', new Date(t0.getTime() + 5 * 60_000));

    // C should now be position 2 (was 3)
    const cStatus = await getStatusByCode(j3.code, new Date(t0.getTime() + 5 * 60_000));
    assert.strictEqual(cStatus.position, 2);
    assert.strictEqual(cStatus.etaMinutes, 16); // 2 × 8
    // But promised time is still the original (joinedAt + 3×8)
    assert.strictEqual(cStatus.etaAt, j3.etaAt);

    // A is untouched at position 1
    const aStatus = await getStatusByCode(j1.code, new Date(t0.getTime() + 5 * 60_000));
    assert.strictEqual(aStatus.position, 1);
    assert.strictEqual(aStatus.etaAt, j1.etaAt);
});

test('callParty: state waiting → called; calls array appends; callsMinutesAgo returned', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    const j = await joinQueue({ name: 'X', partySize: 2 }, t0);
    const list = await listHostQueue(t0);
    const id = list.parties[0].id;

    // First call at +5 min
    await callParty(id, new Date(t0.getTime() + 5 * 60_000));
    const s1 = await getStatusByCode(j.code, new Date(t0.getTime() + 5 * 60_000));
    assert.strictEqual(s1.state, 'called');
    assert.deepStrictEqual(s1.callsMinutesAgo, [0]);

    // Recall at +8 min: array now has both timestamps
    await callParty(id, new Date(t0.getTime() + 8 * 60_000));
    const s2 = await getStatusByCode(j.code, new Date(t0.getTime() + 8 * 60_000));
    assert.strictEqual(s2.state, 'called');
    assert.deepStrictEqual(s2.callsMinutesAgo, [3, 0]);

    // At +12 min, without another call: first is 7m old, second is 4m
    const s3 = await getStatusByCode(j.code, new Date(t0.getTime() + 12 * 60_000));
    assert.deepStrictEqual(s3.callsMinutesAgo, [7, 4]);
});

test('called party still counts toward queue length and position', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'A', partySize: 2 }, new Date(t0.getTime()));
    const j2 = await joinQueue({ name: 'B', partySize: 2 }, new Date(t0.getTime() + 1000));

    const list = await listHostQueue(t0);
    const aId = list.parties[0].id;
    await callParty(aId, t0);

    // B should still be position 2 (called parties don't leave the line)
    const bStatus = await getStatusByCode(j2.code, t0);
    assert.strictEqual(bStatus.position, 2);

    const state = await getQueueState(t0);
    assert.strictEqual(state.partiesWaiting, 2);
});

test('remove called party is allowed', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    const j = await joinQueue({ name: 'A', partySize: 2 }, t0);
    const list = await listHostQueue(t0);
    const id = list.parties[0].id;

    await callParty(id, t0);
    const result = await removeFromQueue(id, 'seated', new Date(t0.getTime() + 1000));
    assert.strictEqual(result.ok, true);

    const status = await getStatusByCode(j.code, new Date(t0.getTime() + 2000));
    assert.strictEqual(status.state, 'seated');
});

test('status for unknown code returns not_found', async () => {
    await resetDb();
    const status = await getStatusByCode('SKB-ZZZ');
    assert.strictEqual(status.state, 'not_found');
    assert.strictEqual(status.position, 0);
});

test('getQueueState: etaForNewPartyMinutes = (waiting+1) × avg', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'A', partySize: 2 }, t0);
    await joinQueue({ name: 'B', partySize: 2 }, new Date(t0.getTime() + 1));
    const s = await getQueueState(t0);
    assert.strictEqual(s.partiesWaiting, 2);
    assert.strictEqual(s.etaForNewPartyMinutes, 24); // (2+1)*8
});

test('listHostQueue returns parties with state and call history', async () => {
    await resetDb();
    const t0 = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'A', partySize: 2 }, t0);
    await joinQueue({ name: 'B', partySize: 2 }, new Date(t0.getTime() + 1));

    const list0 = await listHostQueue(t0);
    assert.strictEqual(list0.parties.length, 2);
    assert.strictEqual(list0.parties[0].state, 'waiting');
    assert.deepStrictEqual(list0.parties[0].callsMinutesAgo, []);

    const aId = list0.parties[0].id;
    await callParty(aId, t0);
    await callParty(aId, new Date(t0.getTime() + 3 * 60_000));

    const list1 = await listHostQueue(new Date(t0.getTime() + 3 * 60_000));
    const a = list1.parties.find(p => p.name === 'A')!;
    assert.strictEqual(a.state, 'called');
    assert.deepStrictEqual(a.callsMinutesAgo, [3, 0]);
});

// Cleanup at the end
test('teardown', async () => {
    await resetDb();
    await closeDb();
});
