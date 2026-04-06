// Integration tests for queue service against real MongoDB.
// Covers: join, remove, call/recall, position recompute, promised-time stability, EOD filter.

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_queue_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings } from '../../src/core/db/mongo.js';
import {
    getQueueState,
    joinQueue,
    getStatusByCode,
    listHostQueue,
    removeFromQueue,
    callParty,
} from '../../src/services/queue.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
}

const cases: BaseTestCase[] = [
    {
        name: 'join: empty queue → position 1, promised ETA = now + avg_turn_time',
        tags: ['integration', 'queue', 'join', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue({ name: 'Alice', partySize: 2 }, new Date('2026-04-05T20:00:00Z'));
            return r.position === 1 && r.etaMinutes === 8 && r.etaAt === '2026-04-05T20:08:00.000Z' && /^SKB-[A-Z2-9]{3}$/.test(r.code);
        },
    },
    {
        name: 'join 3 parties: positions increment; each has fixed promisedEtaAt',
        tags: ['integration', 'queue', 'join', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const base = new Date('2026-04-05T20:00:00Z').getTime();
            const r1 = await joinQueue({ name: 'A', partySize: 2 }, new Date(base));
            const r2 = await joinQueue({ name: 'B', partySize: 3 }, new Date(base + 1000));
            const r3 = await joinQueue({ name: 'C', partySize: 4 }, new Date(base + 2000));
            return r1.position === 1 && r2.position === 2 && r3.position === 3 &&
                r1.etaMinutes === 8 && r2.etaMinutes === 16 && r3.etaMinutes === 24;
        },
    },
    {
        name: 'status: promised time never changes; live etaMinutes reflects current position',
        tags: ['integration', 'queue', 'status', 'promised-time', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const join = await joinQueue({ name: 'Diner', partySize: 2 }, t0);
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            const s5 = await getStatusByCode(join.code, t5);
            const t20 = new Date(t0.getTime() + 20 * 60_000);
            const s20 = await getStatusByCode(join.code, t20);
            return s5.etaAt === join.etaAt && s20.etaAt === join.etaAt && s5.etaMinutes === 8;
        },
    },
    {
        name: 'remove: positions recompute for remaining parties (AC-R6/R7)',
        tags: ['integration', 'queue', 'remove', 'eta', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j1 = await joinQueue({ name: 'A', partySize: 2 }, new Date(t0.getTime()));
            await joinQueue({ name: 'B', partySize: 2 }, new Date(t0.getTime() + 1000));
            const j3 = await joinQueue({ name: 'C', partySize: 2 }, new Date(t0.getTime() + 2000));
            const list = await listHostQueue(t0);
            const bId = list.parties.find(p => p.name === 'B')!.id;
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await removeFromQueue(bId, 'seated', t5);
            const cStatus = await getStatusByCode(j3.code, t5);
            const aStatus = await getStatusByCode(j1.code, t5);
            return cStatus.position === 2 && cStatus.etaMinutes === 16 && cStatus.etaAt === j3.etaAt &&
                aStatus.position === 1 && aStatus.etaAt === j1.etaAt;
        },
    },
    {
        name: 'callParty: state → called; calls array appends; callsMinutesAgo returned',
        tags: ['integration', 'queue', 'call', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j = await joinQueue({ name: 'X', partySize: 2 }, t0);
            const list = await listHostQueue(t0);
            const id = list.parties[0].id;
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await callParty(id, t5);
            const s1 = await getStatusByCode(j.code, t5);
            const t8 = new Date(t0.getTime() + 8 * 60_000);
            await callParty(id, t8);
            const s2 = await getStatusByCode(j.code, t8);
            const t12 = new Date(t0.getTime() + 12 * 60_000);
            const s3 = await getStatusByCode(j.code, t12);
            return s1.state === 'called' && s1.callsMinutesAgo.length === 1 &&
                s2.callsMinutesAgo.length === 2 && s2.callsMinutesAgo[0] === 3 &&
                s3.callsMinutesAgo[0] === 7 && s3.callsMinutesAgo[1] === 4;
        },
    },
    {
        name: 'called party still counts toward queue length and position',
        tags: ['integration', 'queue', 'call', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue({ name: 'A', partySize: 2 }, new Date(t0.getTime()));
            const j2 = await joinQueue({ name: 'B', partySize: 2 }, new Date(t0.getTime() + 1000));
            const list = await listHostQueue(t0);
            await callParty(list.parties[0].id, t0);
            const bStatus = await getStatusByCode(j2.code, t0);
            const state = await getQueueState(t0);
            return bStatus.position === 2 && state.partiesWaiting === 2;
        },
    },
    {
        name: 'remove called party is allowed',
        tags: ['integration', 'queue', 'call', 'remove', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j = await joinQueue({ name: 'A', partySize: 2 }, t0);
            const list = await listHostQueue(t0);
            await callParty(list.parties[0].id, t0);
            const result = await removeFromQueue(list.parties[0].id, 'seated', new Date(t0.getTime() + 1000));
            const status = await getStatusByCode(j.code, new Date(t0.getTime() + 2000));
            return result.ok && status.state === 'seated';
        },
    },
    {
        name: 'status for unknown code returns not_found',
        tags: ['integration', 'queue', 'status'],
        testFn: async () => {
            await resetDb();
            const status = await getStatusByCode('SKB-ZZZ');
            return status.state === 'not_found' && status.position === 0;
        },
    },
    {
        name: 'getQueueState: etaForNewPartyMinutes = (waiting+1) × avg',
        tags: ['integration', 'queue', 'state', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue({ name: 'A', partySize: 2 }, t0);
            await joinQueue({ name: 'B', partySize: 2 }, new Date(t0.getTime() + 1));
            const s = await getQueueState(t0);
            return s.partiesWaiting === 2 && s.etaForNewPartyMinutes === 24;
        },
    },
    {
        name: 'listHostQueue returns parties with state and call history',
        tags: ['integration', 'queue', 'host-queue', 'call'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue({ name: 'A', partySize: 2 }, t0);
            await joinQueue({ name: 'B', partySize: 2 }, new Date(t0.getTime() + 1));
            const list0 = await listHostQueue(t0);
            if (list0.parties[0].state !== 'waiting' || list0.parties[0].callsMinutesAgo.length !== 0) return false;
            const aId = list0.parties[0].id;
            await callParty(aId, t0);
            const t3 = new Date(t0.getTime() + 3 * 60_000);
            await callParty(aId, t3);
            const list1 = await listHostQueue(t3);
            const a = list1.parties.find(p => p.name === 'A')!;
            return a.state === 'called' && a.callsMinutesAgo.length === 2 &&
                a.callsMinutesAgo[0] === 3 && a.callsMinutesAgo[1] === 0;
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'queue'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'queue (integration)');
