// Scale test for the `loc_state_departedAt` partial index.
// Seeds ~500 departed parties into a throwaway dev DB, runs the exact query
// computeDynamicTurnTime issues, and asserts the query planner uses the new
// index (IXSCAN) rather than a collection scan with in-memory sort.
//
// Run with:
//   MONGODB_DB_NAME=skb_scale_test FRAIM_BRANCH='' npx tsx scripts/scale-test-dynamic-index.ts
//
// This script is intended to be run once after adding the index to
// src/core/db/mongo.ts. It cleans up after itself so the throwaway DB can be
// dropped safely.

import { closeDb, getDb, queueEntries } from '../src/core/db/mongo.js';
import { computeDynamicTurnTime } from '../src/services/settings.js';
import type { QueueEntry } from '../src/types/queue.js';

const LOC = 'scale-test-skb';
const SEED_COUNT = 500;

async function seed(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({ locationId: LOC });

    const now = new Date();
    const docs: QueueEntry[] = [];
    for (let i = 0; i < SEED_COUNT; i++) {
        const minutesBack = i * 5; // spread across ~40 hours
        const duration = 10 + (i % 30); // durations between 10 and 39 minutes
        const departedAt = new Date(now.getTime() - minutesBack * 60_000);
        const seatedAt = new Date(departedAt.getTime() - duration * 60_000);
        const joinedAt = new Date(seatedAt.getTime() - 12 * 60_000);
        docs.push({
            locationId: LOC,
            code: `SKB-SCALE${i.toString().padStart(4, '0')}`,
            name: `ScaleTest${i}`,
            partySize: 2,
            phone: '2065550000',
            state: 'departed',
            joinedAt,
            promisedEtaAt: new Date(joinedAt.getTime() + 8 * 60_000),
            serviceDay: '2026-04-13',
            seatedAt,
            departedAt,
            removedAt: departedAt,
            removedReason: 'departed',
        });
    }
    await queueEntries(db).insertMany(docs);
    console.log(`[seed] inserted ${docs.length} departed parties for ${LOC}`);
}

async function runExplain(): Promise<{ stage: string; indexName: string | null; totalDocsExamined: number; executionTimeMillis: number }> {
    const db = await getDb();
    const cursor = queueEntries(db).find({
        locationId: LOC,
        state: 'departed',
        seatedAt: { $exists: true },
        departedAt: { $exists: true },
    })
        .project({ seatedAt: 1, departedAt: 1 })
        .sort({ departedAt: -1 })
        .limit(20);

    const plan = await cursor.explain('executionStats') as Record<string, unknown>;
    const executionStats = plan.executionStats as Record<string, unknown>;
    const queryPlanner = plan.queryPlanner as Record<string, unknown>;
    const winningPlan = queryPlanner.winningPlan as Record<string, unknown>;

    // Walk the winning plan tree to find the first FETCH/IXSCAN/COLLSCAN stage.
    function findStage(node: unknown): { stage: string; indexName: string | null } {
        if (!node || typeof node !== 'object') return { stage: 'UNKNOWN', indexName: null };
        const n = node as Record<string, unknown>;
        const stage = n.stage as string;
        if (stage === 'IXSCAN') return { stage, indexName: (n.indexName as string) ?? null };
        if (stage === 'COLLSCAN') return { stage, indexName: null };
        if (n.inputStage) return findStage(n.inputStage);
        if (Array.isArray(n.inputStages)) {
            for (const child of n.inputStages) {
                const r = findStage(child);
                if (r.stage !== 'UNKNOWN') return r;
            }
        }
        return { stage: stage ?? 'UNKNOWN', indexName: null };
    }

    const { stage, indexName } = findStage(winningPlan);
    return {
        stage,
        indexName,
        totalDocsExamined: executionStats.totalDocsExamined as number,
        executionTimeMillis: executionStats.executionTimeMillis as number,
    };
}

async function main(): Promise<void> {
    console.log('[scale-test] starting — expect IXSCAN on loc_state_departedAt');
    await seed();

    // Running computeDynamicTurnTime to verify it actually returns a sensible result
    const t0 = Date.now();
    const result = await computeDynamicTurnTime(LOC);
    const elapsed = Date.now() - t0;
    console.log(`[compute] returned ${JSON.stringify(result)} in ${elapsed}ms`);
    if (!result) {
        throw new Error('computeDynamicTurnTime returned null — expected a median');
    }
    if (result.sampleSize !== 20) {
        throw new Error(`expected sampleSize=20 (the window cap), got ${result.sampleSize}`);
    }

    // Now explain the raw query to confirm the index is being used.
    const plan = await runExplain();
    console.log(`[explain] stage=${plan.stage} indexName=${plan.indexName ?? '(none)'} totalDocsExamined=${plan.totalDocsExamined} executionTimeMillis=${plan.executionTimeMillis}`);

    if (plan.stage !== 'IXSCAN') {
        console.error(`[FAIL] expected IXSCAN but got ${plan.stage}. The partial index was not used.`);
        process.exit(1);
    }
    if (plan.indexName !== 'loc_state_departedAt') {
        console.error(`[FAIL] expected index 'loc_state_departedAt' but got '${plan.indexName}'`);
        process.exit(1);
    }
    if (plan.totalDocsExamined > 20) {
        console.error(`[FAIL] expected totalDocsExamined<=20 (the query limit) but got ${plan.totalDocsExamined}. The sort may not be covered.`);
        process.exit(1);
    }

    console.log('[scale-test] PASS — index is built, used, and the query executes with bounded work');

    // Clean up so the next run of this script is reproducible
    const db = await getDb();
    const cleaned = await queueEntries(db).deleteMany({ locationId: LOC });
    console.log(`[cleanup] removed ${cleaned.deletedCount} scale-test rows`);

    await closeDb();
}

main().catch(async (err) => {
    console.error('[scale-test] FAIL', err);
    try { await closeDb(); } catch {}
    process.exit(1);
});
