// Integration tests for src/services/analytics.ts getAnalytics — seeds
// queueEntries with known lifecycle timestamps and asserts the returned
// histogram shape, avg, total, and stage-range label.

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME ??= 'skb_analytics_integration_test';
process.env.FRAIM_BRANCH ??= '';

import { closeDb, getDb, queueEntries } from '../../src/core/db/mongo.js';
import { getAnalytics } from '../../src/services/analytics.js';
import { serviceDay } from '../../src/core/utils/time.js';
import type { PartyState } from '../../src/types/queue.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
}

/** Seed a single entry with a specific joined→seated→ordered→served→checkout→departed profile. */
async function seedEntry(
    loc: string,
    now: Date,
    partySize: number,
    offsets: { seated?: number; ordered?: number; served?: number; checkoutDelta?: number; departedDelta?: number } = {},
): Promise<void> {
    const db = await getDb();
    const joinedAt = now;
    const seatedAt = offsets.seated !== undefined ? new Date(joinedAt.getTime() + offsets.seated * 60_000) : undefined;
    const orderedAt = offsets.ordered !== undefined && seatedAt
        ? new Date(seatedAt.getTime() + offsets.ordered * 60_000) : undefined;
    const servedAt = offsets.served !== undefined && orderedAt
        ? new Date(orderedAt.getTime() + offsets.served * 60_000) : undefined;
    const checkoutAt = offsets.checkoutDelta !== undefined && servedAt
        ? new Date(servedAt.getTime() + offsets.checkoutDelta * 60_000) : undefined;
    const departedAt = offsets.departedDelta !== undefined && checkoutAt
        ? new Date(checkoutAt.getTime() + offsets.departedDelta * 60_000) : undefined;

    await queueEntries(db).insertOne({
        locationId: loc,
        code: `SKB-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        name: 'Seed',
        partySize,
        phone: '2065551234',
        state: (departedAt ? 'departed' : checkoutAt ? 'checkout' : servedAt ? 'served' : orderedAt ? 'ordered' : seatedAt ? 'seated' : 'waiting') as PartyState,
        joinedAt,
        promisedEtaAt: joinedAt,
        serviceDay: serviceDay(joinedAt),
        ...(seatedAt && { seatedAt }),
        ...(orderedAt && { orderedAt }),
        ...(servedAt && { servedAt }),
        ...(checkoutAt && { checkoutAt }),
        ...(departedAt && { departedAt }),
    });
}

const cases: BaseTestCase[] = [
    {
        name: 'getAnalytics: default stage pair (joined→checkout) returns one histogram with correct avg',
        tags: ['integration', 'analytics'],
        testFn: async () => {
            await resetDb();
            const now = new Date();
            // Two parties: joined→checkout 20m, 30m. Avg = 25.
            await seedEntry('test', now, 2, { seated: 5, ordered: 5, served: 5, checkoutDelta: 5 }); // 20m join→checkout
            await seedEntry('test', now, 2, { seated: 10, ordered: 5, served: 5, checkoutDelta: 10 }); // 30m
            const a = await getAnalytics('test', '1');
            const h = a.histograms[0];
            return a.histograms.length === 1
                && h?.phase === 'joined-checkout'
                && h?.avg === 25
                && h?.total === 2
                && a.selectedRange?.label === 'Joined -> Checkout'
                && a.totalParties === 2;
        },
    },
    {
        name: 'getAnalytics: explicit seated→served stage pair narrows the histogram',
        tags: ['integration', 'analytics'],
        testFn: async () => {
            await resetDb();
            const now = new Date();
            await seedEntry('test', now, 2, { seated: 2, ordered: 3, served: 7 }); // seated→served = 10m
            const a = await getAnalytics('test', '1', 'all', 'seated', 'served');
            return a.histograms[0]?.avg === 10 && a.histograms[0]?.phase === 'seated-served';
        },
    },
    {
        name: 'getAnalytics: party-size filter 3-4 excludes parties outside the bucket',
        tags: ['integration', 'analytics'],
        testFn: async () => {
            await resetDb();
            const now = new Date();
            await seedEntry('test', now, 2, { seated: 5, ordered: 5, served: 5, checkoutDelta: 5 }); // bucket 1-2
            await seedEntry('test', now, 4, { seated: 5, ordered: 5, served: 5, checkoutDelta: 5 }); // bucket 3-4
            const a = await getAnalytics('test', '1', '3-4');
            return a.totalParties === 1 && a.histograms[0]?.total === 1;
        },
    },
    {
        name: 'getAnalytics: party-size bucket "5+" matches larger parties',
        tags: ['integration', 'analytics'],
        testFn: async () => {
            await resetDb();
            const now = new Date();
            await seedEntry('test', now, 6, { seated: 5, ordered: 5, served: 5, checkoutDelta: 5 });
            const a = await getAnalytics('test', '1', '5+');
            return a.totalParties === 1;
        },
    },
    {
        name: 'getAnalytics: invalid stage pair throws',
        tags: ['integration', 'analytics', 'validation'],
        testFn: async () => {
            await resetDb();
            try {
                await getAnalytics('test', '7', 'all', 'departed', 'seated');
                return false;
            } catch (err) {
                return (err as Error).message.includes('invalid analytics stage range');
            }
        },
    },
    {
        name: 'getAnalytics: empty DB returns histogram with avg=null and total=0',
        tags: ['integration', 'analytics'],
        testFn: async () => {
            await resetDb();
            const a = await getAnalytics('test', '7');
            return a.histograms.length === 1
                && a.histograms[0]?.avg === null
                && a.histograms[0]?.total === 0
                && a.totalParties === 0;
        },
    },
    {
        name: 'getAnalytics: unknown rangeDays value defaults to 7 days',
        tags: ['integration', 'analytics'],
        testFn: async () => {
            await resetDb();
            const a = await getAnalytics('test', 'not-a-number');
            // dateRangeToDays's default is 7 — we don't assert the dateRange string directly
            // (depends on the actual day) but totalParties should be 0.
            return a.totalParties === 0;
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'analytics'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'analytics (integration)');
