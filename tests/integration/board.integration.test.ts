// Integration tests for GET /api/queue/board — the public TV board endpoint.
// Requires Mongo reachable at MONGODB_URI (default mongodb://localhost:27017).

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_board_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings } from '../../src/core/db/mongo.js';
import {
    joinQueue,
    callParty,
    removeFromQueue,
    listHostQueue,
    getBoardEntries,
} from '../../src/services/queue.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
}

const cases: BaseTestCase[] = [
    {
        name: 'board: empty queue returns empty array',
        tags: ['integration', 'board', 'empty-state'],
        testFn: async () => {
            await resetDb();
            const entries = await getBoardEntries('test', new Date('2026-04-05T20:00:00Z'));
            return Array.isArray(entries) && entries.length === 0;
        },
    },
    {
        name: 'board: entries contain only position, code, state — no PII',
        tags: ['integration', 'board', 'privacy'],
        testFn: async () => {
            await resetDb();
            const now = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'Alice', partySize: 3, phoneLast4: '1234' }, now);
            await joinQueue('test', { name: 'Bob', partySize: 2 }, new Date(now.getTime() + 1000));
            const entries = await getBoardEntries('test', now);
            if (entries.length !== 2) return false;
            for (const e of entries) {
                const keys = Object.keys(e).sort();
                if (keys.join(',') !== 'code,position,state') return false;
            }
            return true;
        },
    },
    {
        name: 'board: response does not contain name, phoneLast4, or other PII fields',
        tags: ['integration', 'board', 'privacy'],
        testFn: async () => {
            await resetDb();
            await joinQueue('test', { name: 'Charlie', partySize: 4, phoneLast4: '5678' }, new Date('2026-04-05T20:00:00Z'));
            const entries = await getBoardEntries('test', new Date('2026-04-05T20:00:00Z'));
            const forbidden = ['name', 'phoneLast4', 'partySize', 'joinedAt', 'etaAt', 'promisedEtaAt', 'calls', 'removedAt', 'removedReason', 'serviceDay'];
            const entry = entries[0] as unknown as Record<string, unknown>;
            return forbidden.every(f => entry[f] === undefined);
        },
    },
    {
        name: 'board: excludes entries from a different service day',
        tags: ['integration', 'board', 'service-day'],
        testFn: async () => {
            await resetDb();
            await joinQueue('test', { name: 'Yesterday', partySize: 1 }, new Date('2026-04-05T20:00:00Z'));
            await joinQueue('test', { name: 'Today', partySize: 1 }, new Date('2026-04-06T20:00:00Z'));
            const entries = await getBoardEntries('test', new Date('2026-04-06T20:00:00Z'));
            return entries.length === 1 && entries[0].position === 1;
        },
    },
    {
        name: 'board: returns entries ordered by join time with correct positions',
        tags: ['integration', 'board', 'ordering'],
        testFn: async () => {
            await resetDb();
            const base = new Date('2026-04-05T20:00:00Z').getTime();
            const j1 = await joinQueue('test', { name: 'A', partySize: 1 }, new Date(base));
            const j2 = await joinQueue('test', { name: 'B', partySize: 1 }, new Date(base + 1000));
            const j3 = await joinQueue('test', { name: 'C', partySize: 1 }, new Date(base + 2000));
            const list = await listHostQueue('test', new Date(base));
            await callParty(list.parties[0].id, new Date(base + 3000));
            const entries = await getBoardEntries('test', new Date(base + 3000));
            return entries.length === 3 &&
                entries[0].code === j1.code && entries[0].state === 'called' &&
                entries[1].code === j2.code && entries[1].state === 'waiting' &&
                entries[2].code === j3.code && entries[2].state === 'waiting';
        },
    },
    {
        name: 'board: excludes seated and no-show parties',
        tags: ['integration', 'board', 'removal'],
        testFn: async () => {
            await resetDb();
            const base = new Date('2026-04-05T20:00:00Z').getTime();
            await joinQueue('test', { name: 'A', partySize: 1 }, new Date(base));
            await joinQueue('test', { name: 'B', partySize: 1 }, new Date(base + 1000));
            const j3 = await joinQueue('test', { name: 'C', partySize: 1 }, new Date(base + 2000));
            const list = await listHostQueue('test', new Date(base));
            await removeFromQueue(list.parties[0].id, 'seated', new Date(base + 5000));
            await removeFromQueue(list.parties[1].id, 'no_show', new Date(base + 5000));
            const entries = await getBoardEntries('test', new Date(base + 5000));
            return entries.length === 1 && entries[0].code === j3.code && entries[0].position === 1;
        },
    },
    {
        name: 'board: called party has state "called"',
        tags: ['integration', 'board', 'call'],
        testFn: async () => {
            await resetDb();
            const now = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'X', partySize: 2 }, now);
            const list = await listHostQueue('test', now);
            await callParty(list.parties[0].id, new Date(now.getTime() + 1000));
            const entries = await getBoardEntries('test', new Date(now.getTime() + 1000));
            return entries.length === 1 && entries[0].state === 'called';
        },
    },
    {
        name: 'board: teardown',
        tags: ['integration', 'board'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'board (integration)');
