// Integration tests for dynamic ETA computation and the manual override.
// Exercises the full settings + queue + dining lifecycle against real MongoDB.

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_dynamic_eta_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings } from '../../src/core/db/mongo.js';
import {
    getAvgTurnTime,
    getEffectiveTurnTime,
    setAvgTurnTime,
    setEtaMode,
    computeDynamicTurnTime,
    DEFAULT_AVG_TURN_TIME_MINUTES,
    MIN_DYNAMIC_SAMPLE,
} from '../../src/services/settings.js';
import { joinQueue } from '../../src/services/queue.js';
import type { QueueEntry } from '../../src/types/queue.js';

const LOC = 'test-dyn';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
}

/**
 * Seed `count` departed parties each with a given seated→departed duration in minutes.
 * departedAt timestamps are spread backward from `now` in 1-hour increments so the
 * sort-by-departedAt-descending order is deterministic.
 */
async function seedDeparted(
    count: number,
    durationsMinutes: number[],
    now: Date = new Date(),
): Promise<void> {
    const db = await getDb();
    const docs: QueueEntry[] = [];
    for (let i = 0; i < count; i++) {
        const dur = durationsMinutes[i % durationsMinutes.length];
        const departedAt = new Date(now.getTime() - i * 60 * 60_000);
        const seatedAt = new Date(departedAt.getTime() - dur * 60_000);
        const joinedAt = new Date(seatedAt.getTime() - 10 * 60_000);
        docs.push({
            locationId: LOC,
            code: `SKB-X${i.toString().padStart(2, '0')}`,
            name: `Seed${i}`,
            partySize: 2,
            phone: '2065550000',
            state: 'departed',
            joinedAt,
            promisedEtaAt: new Date(joinedAt.getTime() + 8 * 60_000),
            serviceDay: '2026-04-11',
            seatedAt,
            departedAt,
            removedAt: departedAt,
            removedReason: 'departed',
        });
    }
    if (docs.length > 0) await queueEntries(db).insertMany(docs);
}

const cases: BaseTestCase[] = [
    // ============================================================
    // Baseline / default state
    // ============================================================
    {
        name: 'defaults: no settings doc → effective = DEFAULT, mode = manual, sample = 0',
        tags: ['integration', 'dynamic-eta', 'defaults'],
        testFn: async () => {
            await resetDb();
            const info = await getEffectiveTurnTime(LOC);
            return (
                info.effectiveMinutes === DEFAULT_AVG_TURN_TIME_MINUTES &&
                info.mode === 'manual' &&
                info.manualMinutes === DEFAULT_AVG_TURN_TIME_MINUTES &&
                info.dynamicMinutes === null &&
                info.sampleSize === 0 &&
                info.fellBackToManual === false
            );
        },
    },
    {
        name: 'defaults: getAvgTurnTime returns DEFAULT when nothing configured',
        tags: ['integration', 'dynamic-eta', 'defaults'],
        testFn: async () => {
            await resetDb();
            return (await getAvgTurnTime(LOC)) === DEFAULT_AVG_TURN_TIME_MINUTES;
        },
    },

    // ============================================================
    // Manual mode (default behavior preserved)
    // ============================================================
    {
        name: 'manual mode: setAvgTurnTime then getEffectiveTurnTime returns the manual value',
        tags: ['integration', 'dynamic-eta', 'manual-mode'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 15);
            const info = await getEffectiveTurnTime(LOC);
            return (
                info.effectiveMinutes === 15 &&
                info.mode === 'manual' &&
                info.manualMinutes === 15 &&
                info.dynamicMinutes === null &&
                !info.fellBackToManual
            );
        },
    },
    {
        name: 'manual mode: existing dining data is ignored (no dynamic computation)',
        tags: ['integration', 'dynamic-eta', 'manual-mode'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 8);
            // Seed 10 parties with 30-min durations — would pull dynamic to 30, but we're in manual mode.
            await seedDeparted(10, [30, 30, 30, 30, 30, 30, 30, 30, 30, 30]);
            const info = await getEffectiveTurnTime(LOC);
            return info.effectiveMinutes === 8 && info.mode === 'manual';
        },
    },

    // ============================================================
    // Dynamic mode — insufficient sample → fallback
    // ============================================================
    {
        name: 'dynamic mode: zero departed parties → falls back to manual',
        tags: ['integration', 'dynamic-eta', 'dynamic-mode', 'fallback'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 12);
            await setEtaMode(LOC, 'dynamic');
            const info = await getEffectiveTurnTime(LOC);
            return (
                info.effectiveMinutes === 12 &&
                info.mode === 'dynamic' &&
                info.manualMinutes === 12 &&
                info.dynamicMinutes === null &&
                info.sampleSize === 0 &&
                info.fellBackToManual === true
            );
        },
    },
    {
        name: 'dynamic mode: fewer than MIN_DYNAMIC_SAMPLE parties → falls back to manual',
        tags: ['integration', 'dynamic-eta', 'dynamic-mode', 'fallback'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 12);
            await setEtaMode(LOC, 'dynamic');
            const seedCount = MIN_DYNAMIC_SAMPLE - 1; // 4
            await seedDeparted(seedCount, [30]);
            const info = await getEffectiveTurnTime(LOC);
            return (
                info.effectiveMinutes === 12 && // fell back to manual
                info.mode === 'dynamic' &&
                info.sampleSize === seedCount &&
                info.fellBackToManual === true
            );
        },
    },

    // ============================================================
    // Dynamic mode — sufficient sample → uses median
    // ============================================================
    {
        name: 'dynamic mode: exactly MIN_DYNAMIC_SAMPLE parties → uses computed median',
        tags: ['integration', 'dynamic-eta', 'dynamic-mode', 'median'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 8);
            await setEtaMode(LOC, 'dynamic');
            // 5 parties with durations [10, 11, 14, 18, 22] — median is 14
            await seedDeparted(5, [10, 11, 14, 18, 22]);
            const info = await getEffectiveTurnTime(LOC);
            return (
                info.effectiveMinutes === 14 &&
                info.mode === 'dynamic' &&
                info.dynamicMinutes === 14 &&
                info.sampleSize === 5 &&
                info.fellBackToManual === false
            );
        },
    },
    {
        name: 'dynamic mode: median is robust to one outlier (180min anniversary dinner)',
        tags: ['integration', 'dynamic-eta', 'dynamic-mode', 'median', 'outlier-robustness'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 8);
            await setEtaMode(LOC, 'dynamic');
            // Without outlier median would be 15. With one 180-min outlier at the top,
            // median of [8, 12, 15, 18, 180] is still 15.
            await seedDeparted(5, [8, 12, 15, 18, 180]);
            const info = await getEffectiveTurnTime(LOC);
            return info.effectiveMinutes === 15 && info.dynamicMinutes === 15;
        },
    },
    {
        name: 'dynamic mode: sample window caps at DYNAMIC_SAMPLE_WINDOW (most recent 20)',
        tags: ['integration', 'dynamic-eta', 'dynamic-mode', 'window-cap'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 8);
            await setEtaMode(LOC, 'dynamic');
            // 30 parties all 15 minutes. We expect sampleSize exactly 20.
            await seedDeparted(30, [15]);
            const info = await getEffectiveTurnTime(LOC);
            return info.sampleSize === 20 && info.effectiveMinutes === 15;
        },
    },

    // ============================================================
    // Queue integration — joinQueue uses the effective value
    // ============================================================
    {
        name: 'joinQueue uses effective (dynamic) value for the promised ETA',
        tags: ['integration', 'dynamic-eta', 'queue-integration', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 8); // manual fallback = 8
            await setEtaMode(LOC, 'dynamic');
            // Seed 5 parties all 20 minutes — dynamic should be 20
            await seedDeparted(5, [20]);
            const r = await joinQueue(
                LOC,
                { name: 'DynTest', partySize: 2, phone: '2065559999' },
                new Date('2026-04-11T20:00:00Z'),
            );
            // Position 1 × 20 min = 20 min promised
            return r.etaMinutes === 20 && r.position === 1;
        },
    },
    {
        name: 'joinQueue uses manual fallback when dynamic mode has no sample',
        tags: ['integration', 'dynamic-eta', 'queue-integration', 'fallback'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 11);
            await setEtaMode(LOC, 'dynamic');
            // No departed parties seeded — should fall back
            const r = await joinQueue(
                LOC,
                { name: 'FallbackTest', partySize: 2, phone: '2065559998' },
                new Date('2026-04-11T20:00:00Z'),
            );
            return r.etaMinutes === 11 && r.position === 1;
        },
    },
    {
        name: 'joinQueue still works in manual mode (backwards compat)',
        tags: ['integration', 'dynamic-eta', 'queue-integration', 'backwards-compat'],
        testFn: async () => {
            await resetDb();
            await setAvgTurnTime(LOC, 13);
            // Note: no setEtaMode call — should default to manual
            const r = await joinQueue(
                LOC,
                { name: 'ManualTest', partySize: 2, phone: '2065559997' },
                new Date('2026-04-11T20:00:00Z'),
            );
            return r.etaMinutes === 13 && r.position === 1;
        },
    },

    // ============================================================
    // Mode persistence + setEtaMode validation
    // ============================================================
    {
        name: 'setEtaMode persists and round-trips through getEffectiveTurnTime',
        tags: ['integration', 'dynamic-eta', 'persistence'],
        testFn: async () => {
            await resetDb();
            await setEtaMode(LOC, 'dynamic');
            const info1 = await getEffectiveTurnTime(LOC);
            if (info1.mode !== 'dynamic') return false;
            await setEtaMode(LOC, 'manual');
            const info2 = await getEffectiveTurnTime(LOC);
            return info2.mode === 'manual';
        },
    },
    {
        name: 'setEtaMode rejects invalid mode',
        tags: ['integration', 'dynamic-eta', 'validation'],
        testFn: async () => {
            await resetDb();
            try {
                await setEtaMode(LOC, 'garbage' as 'manual');
                return false; // should have thrown
            } catch (err) {
                return err instanceof Error && err.message.startsWith('etaMode');
            }
        },
    },
    {
        name: 'computeDynamicTurnTime returns null when no departed entries',
        tags: ['integration', 'dynamic-eta', 'helper'],
        testFn: async () => {
            await resetDb();
            return (await computeDynamicTurnTime(LOC)) === null;
        },
    },

    // ============================================================
    // Multi-tenant isolation — dynamic values are scoped per location
    // ============================================================
    {
        name: 'multi-tenant: dynamic mode at location A does not affect location B',
        tags: ['integration', 'dynamic-eta', 'multi-tenant'],
        testFn: async () => {
            await resetDb();
            const LOC_A = 'tenant-a';
            const LOC_B = 'tenant-b';
            await setAvgTurnTime(LOC_A, 8);
            await setAvgTurnTime(LOC_B, 8);
            await setEtaMode(LOC_A, 'dynamic');
            // Seed 5 long-duration parties ONLY at location A
            const db = await getDb();
            const now = new Date('2026-04-11T20:00:00Z');
            for (let i = 0; i < 5; i++) {
                const departedAt = new Date(now.getTime() - i * 3_600_000);
                const seatedAt = new Date(departedAt.getTime() - 25 * 60_000);
                await queueEntries(db).insertOne({
                    locationId: LOC_A,
                    code: `SKB-A${i}`,
                    name: 'X',
                    partySize: 2,
                    phone: '2065550000',
                    state: 'departed',
                    joinedAt: seatedAt,
                    promisedEtaAt: seatedAt,
                    serviceDay: '2026-04-11',
                    seatedAt,
                    departedAt,
                });
            }
            const infoA = await getEffectiveTurnTime(LOC_A);
            const infoB = await getEffectiveTurnTime(LOC_B);
            return (
                infoA.mode === 'dynamic' &&
                infoA.effectiveMinutes === 25 && // dynamic
                infoB.mode === 'manual' &&
                infoB.effectiveMinutes === 8 // still the manual value, no cross-tenant leakage
            );
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'dynamic-eta'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'dynamic-eta integration tests');
