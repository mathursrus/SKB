// Integration tests for GET /api/queue/board — the public TV board endpoint.
// Requires Mongo reachable at MONGODB_URI (default mongodb://localhost:27017).
// Validates: field projection (no PII), service-day filtering, ordering, empty state.

import { test } from 'node:test';
import assert from 'node:assert';

// Force a dedicated integration-test DB name.
process.env.MONGODB_DB_NAME = 'skb_board_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings } from '../src/core/db/mongo.js';
import {
    joinQueue,
    callParty,
    removeFromQueue,
    listHostQueue,
    getBoardEntries,
} from '../src/services/queue.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
}

// ---------------------------------------------------------------------------
// AC-R8: Empty queue returns empty array
// ---------------------------------------------------------------------------
test('board: empty queue returns empty array', async () => {
    await resetDb();
    const now = new Date('2026-04-05T20:00:00Z');
    const entries = await getBoardEntries(now);
    assert.ok(Array.isArray(entries), 'response must be an array');
    assert.strictEqual(entries.length, 0);
});

// ---------------------------------------------------------------------------
// AC-R1: Returns only position, code, state fields
// ---------------------------------------------------------------------------
test('board: entries contain only position, code, state — no PII', async () => {
    await resetDb();
    const now = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'Alice', partySize: 3, phoneLast4: '1234' }, now);
    await joinQueue({ name: 'Bob', partySize: 2 }, new Date(now.getTime() + 1000));

    const entries = await getBoardEntries(now);
    assert.strictEqual(entries.length, 2);

    for (const entry of entries) {
        const keys = Object.keys(entry).sort();
        assert.deepStrictEqual(keys, ['code', 'position', 'state'],
            `entry should only have position, code, state — got: ${keys.join(', ')}`);
    }
});

// ---------------------------------------------------------------------------
// AC-R2: No PII fields present
// ---------------------------------------------------------------------------
test('board: response does not contain name, phoneLast4, partySize, joinedAt, or etaAt', async () => {
    await resetDb();
    const now = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'Charlie', partySize: 4, phoneLast4: '5678' }, now);

    const entries = await getBoardEntries(now);
    assert.strictEqual(entries.length, 1);

    const entry = entries[0];
    const forbidden = ['name', 'phoneLast4', 'partySize', 'joinedAt', 'etaAt', 'promisedEtaAt', 'calls', 'removedAt', 'removedReason', 'serviceDay'];
    for (const field of forbidden) {
        assert.strictEqual(
            (entry as unknown as Record<string, unknown>)[field],
            undefined,
            `PII field "${field}" must not be present in board response`,
        );
    }
});

// ---------------------------------------------------------------------------
// AC-R3: Filters to current service day only
// ---------------------------------------------------------------------------
test('board: excludes entries from a different service day', async () => {
    await resetDb();
    // Insert entry for April 5
    const day1 = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'Yesterday', partySize: 1 }, day1);

    // Query for April 6 — stale entry should not appear
    const day2 = new Date('2026-04-06T20:00:00Z');
    await joinQueue({ name: 'Today', partySize: 1 }, day2);

    const entries = await getBoardEntries(day2);
    assert.strictEqual(entries.length, 1, 'only today\'s entry should appear');
    assert.strictEqual(entries[0].position, 1);
});

// ---------------------------------------------------------------------------
// AC-R1 + ordering: 3 parties, 2 waiting + 1 called, ordered by joinedAt
// ---------------------------------------------------------------------------
test('board: returns entries ordered by join time with correct positions', async () => {
    await resetDb();
    const base = new Date('2026-04-05T20:00:00Z').getTime();
    const j1 = await joinQueue({ name: 'A', partySize: 1 }, new Date(base));
    const j2 = await joinQueue({ name: 'B', partySize: 1 }, new Date(base + 1000));
    const j3 = await joinQueue({ name: 'C', partySize: 1 }, new Date(base + 2000));

    // Call party A
    const list = await listHostQueue(new Date(base));
    await callParty(list.parties[0].id, new Date(base + 3000));

    const entries = await getBoardEntries(new Date(base + 3000));
    assert.strictEqual(entries.length, 3);

    // Verify ordering: A (pos 1, called), B (pos 2, waiting), C (pos 3, waiting)
    assert.strictEqual(entries[0].position, 1);
    assert.strictEqual(entries[0].code, j1.code);
    assert.strictEqual(entries[0].state, 'called');

    assert.strictEqual(entries[1].position, 2);
    assert.strictEqual(entries[1].code, j2.code);
    assert.strictEqual(entries[1].state, 'waiting');

    assert.strictEqual(entries[2].position, 3);
    assert.strictEqual(entries[2].code, j3.code);
    assert.strictEqual(entries[2].state, 'waiting');
});

// ---------------------------------------------------------------------------
// Excludes seated and no-show parties
// ---------------------------------------------------------------------------
test('board: excludes seated and no-show parties', async () => {
    await resetDb();
    const base = new Date('2026-04-05T20:00:00Z').getTime();
    await joinQueue({ name: 'A', partySize: 1 }, new Date(base));
    await joinQueue({ name: 'B', partySize: 1 }, new Date(base + 1000));
    const j3 = await joinQueue({ name: 'C', partySize: 1 }, new Date(base + 2000));

    const list = await listHostQueue(new Date(base));
    // Seat A, mark B as no-show
    await removeFromQueue(list.parties[0].id, 'seated', new Date(base + 5000));
    await removeFromQueue(list.parties[1].id, 'no_show', new Date(base + 5000));

    const entries = await getBoardEntries(new Date(base + 5000));
    assert.strictEqual(entries.length, 1, 'only C should remain');
    assert.strictEqual(entries[0].code, j3.code);
    assert.strictEqual(entries[0].position, 1, 'C becomes position 1 after A and B removed');
});

// ---------------------------------------------------------------------------
// AC-R7: Called entries have state "called"
// ---------------------------------------------------------------------------
test('board: called party has state "called"', async () => {
    await resetDb();
    const now = new Date('2026-04-05T20:00:00Z');
    await joinQueue({ name: 'X', partySize: 2 }, now);

    const list = await listHostQueue(now);
    await callParty(list.parties[0].id, new Date(now.getTime() + 1000));

    const entries = await getBoardEntries(new Date(now.getTime() + 1000));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].state, 'called');
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
test('board: teardown', async () => {
    await resetDb();
    await closeDb();
});
