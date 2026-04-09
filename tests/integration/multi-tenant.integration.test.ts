// Integration tests for multi-tenant isolation + locations service + analytics
// Proves that location A's data is invisible to location B.

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_multitenant_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings, locations } from '../../src/core/db/mongo.js';
import { joinQueue, getQueueState, listHostQueue, getBoardEntries } from '../../src/services/queue.js';
import { getAvgTurnTime, setAvgTurnTime } from '../../src/services/settings.js';
import { ensureLocation, getLocation, listLocations } from '../../src/services/locations.js';
import { getAnalytics } from '../../src/services/analytics.js';
import { listDiningParties, listCompletedParties, advanceParty } from '../../src/services/dining.js';
import { getHostStats } from '../../src/services/stats.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
    await locations(db).deleteMany({});
}

const cases: BaseTestCase[] = [
    // -- Location service --
    {
        name: 'ensureLocation: creates new location',
        tags: ['integration', 'multi-tenant', 'locations'],
        testFn: async () => {
            await resetDb();
            const loc = await ensureLocation('loc-a', 'Restaurant A', '1111');
            return loc._id === 'loc-a' && loc.name === 'Restaurant A' && loc.pin === '1111';
        },
    },
    {
        name: 'ensureLocation: returns existing location without overwriting',
        tags: ['integration', 'multi-tenant', 'locations'],
        testFn: async () => {
            await resetDb();
            await ensureLocation('loc-a', 'Restaurant A', '1111');
            const loc = await ensureLocation('loc-a', 'Different Name', '9999');
            return loc.name === 'Restaurant A' && loc.pin === '1111';
        },
    },
    {
        name: 'getLocation: returns null for nonexistent',
        tags: ['integration', 'multi-tenant', 'locations'],
        testFn: async () => {
            await resetDb();
            return (await getLocation('nonexistent')) === null;
        },
    },
    {
        name: 'listLocations: returns all locations sorted',
        tags: ['integration', 'multi-tenant', 'locations'],
        testFn: async () => {
            await resetDb();
            await ensureLocation('b-loc', 'B', '2222');
            await ensureLocation('a-loc', 'A', '1111');
            const locs = await listLocations();
            return locs.length === 2 && locs[0]._id === 'a-loc' && locs[1]._id === 'b-loc';
        },
    },

    // -- Queue isolation --
    {
        name: 'queue isolation: location A parties invisible to location B',
        tags: ['integration', 'multi-tenant', 'isolation', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t = new Date('2026-04-07T20:00:00Z');
            await joinQueue('loc-a', { name: 'Alice', partySize: 2, phone: '2065551234' }, t);
            await joinQueue('loc-a', { name: 'Bob', partySize: 3, phone: '2065551235' }, new Date(t.getTime() + 1000));
            await joinQueue('loc-b', { name: 'Charlie', partySize: 4, phone: '2065551236' }, new Date(t.getTime() + 2000));

            const stateA = await getQueueState('loc-a', t);
            const stateB = await getQueueState('loc-b', t);
            const listA = await listHostQueue('loc-a', t);
            const listB = await listHostQueue('loc-b', t);

            return stateA.partiesWaiting === 2 && stateB.partiesWaiting === 1 &&
                listA.parties.length === 2 && listB.parties.length === 1 &&
                listA.parties[0].name === 'Alice' && listB.parties[0].name === 'Charlie';
        },
    },
    {
        name: 'board isolation: location A board excludes location B entries',
        tags: ['integration', 'multi-tenant', 'isolation'],
        testFn: async () => {
            await resetDb();
            const t = new Date('2026-04-07T20:00:00Z');
            await joinQueue('loc-a', { name: 'Alice', partySize: 2, phone: '2065551234' }, t);
            await joinQueue('loc-b', { name: 'Bob', partySize: 3, phone: '2065551235' }, new Date(t.getTime() + 1000));

            const boardA = await getBoardEntries('loc-a', t);
            const boardB = await getBoardEntries('loc-b', t);
            return boardA.length === 1 && boardB.length === 1;
        },
    },

    // -- Settings isolation --
    {
        name: 'settings isolation: per-location avgTurnTime',
        tags: ['integration', 'multi-tenant', 'isolation'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime('loc-a', 10);
            await setAvgTurnTime('loc-b', 20);
            const a = await getAvgTurnTime('loc-a');
            const b = await getAvgTurnTime('loc-b');
            return a === 10 && b === 20;
        },
    },
    {
        name: 'settings: unset location returns default',
        tags: ['integration', 'multi-tenant'],
        testFn: async () => {
            await resetDb();
            const d = await getAvgTurnTime('nonexistent');
            return d === 8; // DEFAULT_AVG_TURN_TIME_MINUTES
        },
    },

    // -- Stats isolation --
    {
        name: 'stats isolation: location A stats exclude location B data',
        tags: ['integration', 'multi-tenant', 'isolation'],
        testFn: async () => {
            await resetDb();
            const t = new Date('2026-04-07T20:00:00Z');
            await joinQueue('loc-a', { name: 'A1', partySize: 2, phone: '2065551234' }, t);
            await joinQueue('loc-a', { name: 'A2', partySize: 2, phone: '2065551235' }, new Date(t.getTime() + 1));
            await joinQueue('loc-b', { name: 'B1', partySize: 2, phone: '2065551236' }, new Date(t.getTime() + 2));

            const statsA = await getHostStats('loc-a', t);
            const statsB = await getHostStats('loc-b', t);
            return statsA.totalJoined === 2 && statsB.totalJoined === 1;
        },
    },

    // -- Dining isolation --
    {
        name: 'dining isolation: location A dining excludes location B',
        tags: ['integration', 'multi-tenant', 'isolation'],
        testFn: async () => {
            await resetDb();
            const t = new Date('2026-04-07T20:00:00Z');
            const jA = await joinQueue('loc-a', { name: 'Alice', partySize: 2, phone: '2065551234' }, t);
            const jB = await joinQueue('loc-b', { name: 'Bob', partySize: 3, phone: '2065551235' }, new Date(t.getTime() + 1));

            // Seat both
            const listA = await listHostQueue('loc-a', t);
            const listB = await listHostQueue('loc-b', t);
            const { removeFromQueue } = await import('../../src/services/queue.js');
            await removeFromQueue(listA.parties[0].id, 'seated', t);
            await removeFromQueue(listB.parties[0].id, 'seated', t);

            const diningA = await listDiningParties('loc-a', t);
            const diningB = await listDiningParties('loc-b', t);
            return diningA.parties.length === 1 && diningA.parties[0].name === 'Alice' &&
                diningB.parties.length === 1 && diningB.parties[0].name === 'Bob';
        },
    },

    // -- Analytics isolation --
    {
        name: 'analytics isolation: location A analytics excludes location B',
        tags: ['integration', 'multi-tenant', 'isolation', 'analytics'],
        testFn: async () => {
            await resetDb();
            const t = new Date('2026-04-07T20:00:00Z');
            // Create full-lifecycle entry for loc-a
            const jA = await joinQueue('loc-a', { name: 'Alice', partySize: 2, phone: '2065551234' }, t);
            const listA = await listHostQueue('loc-a', t);
            const { removeFromQueue } = await import('../../src/services/queue.js');
            await removeFromQueue(listA.parties[0].id, 'seated', new Date(t.getTime() + 600_000));
            await advanceParty(listA.parties[0].id, 'departed', new Date(t.getTime() + 1200_000));

            // Create entry for loc-b (just joined, not seated)
            await joinQueue('loc-b', { name: 'Bob', partySize: 3, phone: '2065551235' }, t);

            const analyticsA = await getAnalytics('loc-a', '7');
            const analyticsB = await getAnalytics('loc-b', '7');
            return analyticsA.totalParties === 1 && analyticsB.totalParties === 0;
        },
    },

    // -- Completed isolation --
    {
        name: 'completed isolation: location A completed excludes location B',
        tags: ['integration', 'multi-tenant', 'isolation'],
        testFn: async () => {
            await resetDb();
            const t = new Date('2026-04-07T20:00:00Z');
            await joinQueue('loc-a', { name: 'Alice', partySize: 2, phone: '2065551234' }, t);
            const listA = await listHostQueue('loc-a', t);
            const { removeFromQueue } = await import('../../src/services/queue.js');
            await removeFromQueue(listA.parties[0].id, 'seated', t);
            await advanceParty(listA.parties[0].id, 'departed', t);

            await joinQueue('loc-b', { name: 'Bob', partySize: 3, phone: '2065551235' }, new Date(t.getTime() + 1));
            const listB = await listHostQueue('loc-b', new Date(t.getTime() + 1));
            await removeFromQueue(listB.parties[0].id, 'no_show', new Date(t.getTime() + 2));

            const compA = await listCompletedParties('loc-a', t);
            const compB = await listCompletedParties('loc-b', t);
            return compA.parties.length === 1 && compA.parties[0].name === 'Alice' &&
                compB.parties.length === 1 && compB.parties[0].name === 'Bob';
        },
    },

    {
        name: 'teardown',
        tags: ['integration', 'multi-tenant'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'multi-tenant isolation');
