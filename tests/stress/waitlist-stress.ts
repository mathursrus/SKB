// ============================================================================
// SKB - Waitlist stress test
// ============================================================================
//
// Spawns N simulated diners and one host loop running concurrently against
// the service layer (direct, in-process — bypasses the HTTP layer so we
// can exercise *data integrity* under realistic concurrency without fighting
// the /queue/join IP rate limit). Each diner joins, polls its status, and
// waits for a terminal state (seated / no_show / departed / timeout). The
// host loop walks the waiting list on a tight cadence and randomly notifies
// / seats / no-shows / advances parties through the dining lifecycle.
//
// At the end the script prints ops counts, per-op latency percentiles, and
// runs a set of hard assertions on the final collection state:
//
//   A1  no service errors thrown during the run
//   A2  conservation: totalJoined === waiting + dining + complete + unaccounted
//   A3  queue positions in the waiting list are 1..N with no gaps or dupes
//   A4  HostStats.totalJoined matches the number of successful join ops
//   A5  HostStats.partiesSeated + noShows is consistent with the terminal mix
//   A6  no two currently-dining parties share a table number
//   A7  no party is stuck in a state with a missing required timestamp
//   A8  every diner that successfully joined either reached a terminal state
//       or is still active (none silently dropped)
//   A9  p95 latency per op under a sane threshold (service layer, in-proc)
//
// Usage:
//
//   npm run stress
//     — against local mongo, skb_stress_test database, fresh slate.
//
//   MONGODB_URI=mongodb://host:port/ npm run stress
//     — point at a different mongo instance.
//
//   STRESS_NUM_DINERS=500 STRESS_DURATION_MS=180000 npm run stress
//     — turn the knobs for a heavier run.
// ============================================================================

// Env must be set BEFORE importing anything that touches the db module.
// Use a dedicated db so we never pollute dev/prod.
process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'skb_stress_test';
process.env.FRAIM_BRANCH = '';

import {
    closeDb,
    getDb,
    locations as locationsColl,
    queueEntries,
    queueMessages,
    settings as settingsColl,
} from '../../src/core/db/mongo.js';
import {
    joinQueue,
    listHostQueue,
    callParty,
    removeFromQueue,
    getStatusByCode,
} from '../../src/services/queue.js';
import {
    advanceParty,
    listDiningParties,
    listCompletedParties,
} from '../../src/services/dining.js';
import { getHostStats } from '../../src/services/stats.js';
import { ensureLocation } from '../../src/services/locations.js';

// --- Tunables ---------------------------------------------------------------

const LOCATION_ID = 'stress';
const NUM_DINERS = Number(process.env.STRESS_NUM_DINERS ?? 200);
const TEST_DURATION_MS = Number(process.env.STRESS_DURATION_MS ?? 75_000); // 75s
const MAX_PARTY_SIZE = 6;

// Diner poll cadence (random within this range)
const DINER_POLL_MIN_MS = 600;
const DINER_POLL_MAX_MS = 1_800;

// Host loop cadence (random within this range)
const HOST_TICK_MIN_MS = 150;
const HOST_TICK_MAX_MS = 400;

// Per-row action probabilities inside the host loop.
const P_NOTIFY_IF_WAITING = 0.35;
const P_SEAT_IF_NOTIFIED_OR_WAITING = 0.45;
const P_NO_SHOW = 0.07;
const P_ADVANCE_DINING = 0.40;
const TABLE_POOL_SIZE = 30;

// Latency budgets for A9 (service-layer, in-process).
const P95_BUDGET_MS: Record<string, number> = {
    join: 300,
    status: 150,
    notify: 300,
    seat: 300,
    no_show: 200,
    advance: 200,
    list_host: 300,
    list_dining: 300,
};

// --- Utilities --------------------------------------------------------------

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function randInt(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function rnd(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((sorted.length * p) / 100) - 1));
    return sorted[idx];
}

// --- Report -----------------------------------------------------------------

interface LatSample {
    op: string;
    ms: number;
}

interface OpError {
    op: string;
    msg: string;
    stack?: string;
}

class Report {
    counts: Record<string, number> = {
        joins: 0,
        statusChecks: 0,
        notifies: 0,
        seats: 0,
        seatConflicts: 0,
        noShows: 0,
        advances: 0,
        listHost: 0,
        listDining: 0,
    };
    latencies: LatSample[] = [];
    errors: OpError[] = [];

    async time<T>(op: string, fn: () => Promise<T>): Promise<T> {
        const t0 = Date.now();
        try {
            const result = await fn();
            this.latencies.push({ op, ms: Date.now() - t0 });
            return result;
        } catch (err) {
            this.errors.push({
                op,
                msg: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
            });
            throw err;
        }
    }
}

// --- Diner simulator --------------------------------------------------------

type DinerOutcome =
    | 'seated'
    | 'departed'
    | 'no_show'
    | 'still_waiting_at_end'
    | 'still_called_at_end'
    | 'still_dining_at_end'
    | 'timeout_join'
    | 'join_failed'
    | 'not_found';

interface DinerResult {
    id: number;
    code?: string;
    outcome: DinerOutcome;
    joinedAtMs?: number;
    terminalAtMs?: number;
}

async function simulateDiner(
    id: number,
    report: Report,
    stopAt: number,
): Promise<DinerResult> {
    // Stagger joins over roughly the first third of the test window so the
    // host loop always has something to work on, not a giant initial lump.
    const joinDelay = rnd(0, TEST_DURATION_MS / 3);
    await sleep(joinDelay);
    if (Date.now() >= stopAt) {
        return { id, outcome: 'timeout_join' };
    }

    let code: string | undefined;
    const joinedAtMs = Date.now();
    try {
        const j = await report.time('join', () =>
            joinQueue(LOCATION_ID, {
                name: `Diner ${id}`,
                partySize: randInt(1, MAX_PARTY_SIZE),
                // Use a synthetic 10-digit phone so phone-unique indexes (if
                // any) don't collide across runs; keep it in 206555XXXX.
                phone: `206555${String(id).padStart(4, '0')}`,
            }),
        );
        report.counts.joins++;
        code = j.code;
    } catch {
        return { id, outcome: 'join_failed', joinedAtMs };
    }

    // Poll status until terminal or stop.
    while (Date.now() < stopAt) {
        await sleep(rnd(DINER_POLL_MIN_MS, DINER_POLL_MAX_MS));
        if (Date.now() >= stopAt) break;
        try {
            const s = await report.time('status', () => getStatusByCode(code!));
            report.counts.statusChecks++;
            if (s.state === 'seated') return { id, code, outcome: 'seated', joinedAtMs, terminalAtMs: Date.now() };
            if (s.state === 'no_show') return { id, code, outcome: 'no_show', joinedAtMs, terminalAtMs: Date.now() };
            if (s.state === 'departed') return { id, code, outcome: 'departed', joinedAtMs, terminalAtMs: Date.now() };
            if (s.state === 'not_found') return { id, code, outcome: 'not_found', joinedAtMs };
        } catch {
            // tracked via report.time
        }
    }
    return { id, code, outcome: 'still_waiting_at_end', joinedAtMs };
}

// --- Host loop --------------------------------------------------------------

async function runHostLoop(report: Report, stopAt: number): Promise<void> {
    while (Date.now() < stopAt) {
        await sleep(rnd(HOST_TICK_MIN_MS, HOST_TICK_MAX_MS));
        if (Date.now() >= stopAt) break;

        // --- Waiting + called parties: notify / seat / no-show ---
        try {
            const q = await report.time('list_host', () => listHostQueue(LOCATION_ID));
            report.counts.listHost++;

            for (const party of q.parties) {
                if (Date.now() >= stopAt) return;
                const roll = Math.random();

                if (party.state === 'waiting' && roll < P_NOTIFY_IF_WAITING) {
                    try {
                        await report.time('notify', () => callParty(party.id));
                        report.counts.notifies++;
                    } catch { /* tracked */ }
                    continue;
                }
                if (
                    (party.state === 'waiting' || party.state === 'called') &&
                    roll < P_NOTIFY_IF_WAITING + P_SEAT_IF_NOTIFIED_OR_WAITING
                ) {
                    const tableNumber = randInt(1, TABLE_POOL_SIZE);
                    try {
                        const result = await report.time('seat', () =>
                            removeFromQueue(party.id, 'seated', { tableNumber }),
                        );
                        if (result.conflict) {
                            report.counts.seatConflicts++;
                        } else if (result.ok) {
                            report.counts.seats++;
                        }
                    } catch { /* tracked */ }
                    continue;
                }
                if (roll < P_NOTIFY_IF_WAITING + P_SEAT_IF_NOTIFIED_OR_WAITING + P_NO_SHOW) {
                    try {
                        const r = await report.time('no_show', () =>
                            removeFromQueue(party.id, 'no_show'),
                        );
                        if (r.ok) report.counts.noShows++;
                    } catch { /* tracked */ }
                }
            }
        } catch { /* tracked */ }

        // --- Dining parties: advance through the lifecycle ---
        try {
            const dining = await report.time('list_dining', () => listDiningParties(LOCATION_ID));
            report.counts.listDining++;
            for (const p of dining.parties) {
                if (Date.now() >= stopAt) return;
                if (Math.random() > P_ADVANCE_DINING) continue;
                const next = NEXT_STATE[p.state];
                if (!next) continue;
                try {
                    const r = await report.time('advance', () => advanceParty(p.id, next));
                    if (r.ok) report.counts.advances++;
                } catch { /* tracked */ }
            }
        } catch { /* tracked */ }
    }
}

const NEXT_STATE: Record<string, string> = {
    seated: 'ordered',
    ordered: 'served',
    served: 'checkout',
    checkout: 'departed',
};

// --- Assertions -------------------------------------------------------------

interface AssertionResult {
    name: string;
    pass: boolean;
    detail?: string;
}

class Assertions {
    results: AssertionResult[] = [];
    record(name: string, pass: boolean, detail?: string): void {
        this.results.push({ name, pass, detail });
    }
    get failed(): AssertionResult[] {
        return this.results.filter((r) => !r.pass);
    }
}

// --- Main -------------------------------------------------------------------

async function resetStressDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({ locationId: LOCATION_ID });
    await queueMessages(db).deleteMany({ locationId: LOCATION_ID });
    await settingsColl(db).deleteOne({ _id: LOCATION_ID });
    await locationsColl(db).deleteOne({ _id: LOCATION_ID });
}

function padOp(s: string): string {
    return s.padEnd(14);
}

function fmtMs(n: number): string {
    return `${n}ms`.padStart(7);
}

async function main(): Promise<void> {
    console.log('========================================');
    console.log(' SKB Waitlist stress test');
    console.log('========================================');
    console.log(`Mongo db            : ${process.env.MONGODB_DB_NAME}`);
    console.log(`Location id         : ${LOCATION_ID}`);
    console.log(`Num diners          : ${NUM_DINERS}`);
    console.log(`Test duration       : ${Math.round(TEST_DURATION_MS / 1000)}s`);
    console.log('');

    await resetStressDb();
    await ensureLocation(LOCATION_ID, 'Stress Test', '0000');

    const report = new Report();
    const t0 = Date.now();
    const stopAt = t0 + TEST_DURATION_MS;

    console.log(`[${new Date().toISOString()}] starting ${NUM_DINERS} diners + host loop`);

    const dinerPromises = Array.from({ length: NUM_DINERS }, (_, i) =>
        simulateDiner(i, report, stopAt),
    );
    const hostPromise = runHostLoop(report, stopAt);

    const [hostResult, ...dinerResults] = await Promise.all([
        hostPromise.then(() => ({} as unknown)),
        ...dinerPromises,
    ]);
    void hostResult;

    const elapsedMs = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] main loop done in ${(elapsedMs / 1000).toFixed(1)}s`);

    // Final state snapshot.
    const hostQueue = await listHostQueue(LOCATION_ID);
    const dining = await listDiningParties(LOCATION_ID);
    const completed = await listCompletedParties(LOCATION_ID);
    const stats = await getHostStats(LOCATION_ID);

    // ---- Report ----
    console.log('');
    console.log('========================================');
    console.log(' Results');
    console.log('========================================');
    console.log('');
    console.log('Ops:');
    for (const key of Object.keys(report.counts)) {
        console.log(`  ${padOp(key)}: ${report.counts[key]}`);
    }
    console.log(`  ${padOp('errors')}: ${report.errors.length}`);
    if (report.errors.length > 0) {
        console.log('  first 3 errors:');
        for (const e of report.errors.slice(0, 3)) {
            console.log(`    [${e.op}] ${e.msg}`);
        }
    }

    console.log('');
    console.log('Latency by op (p50 / p95 / p99 / max):');
    const opsSeen = [...new Set(report.latencies.map((l) => l.op))].sort();
    for (const op of opsSeen) {
        const lats = report.latencies.filter((l) => l.op === op).map((l) => l.ms);
        const p50 = percentile(lats, 50);
        const p95 = percentile(lats, 95);
        const p99 = percentile(lats, 99);
        const mx = Math.max(...lats);
        const n = lats.length;
        console.log(
            `  ${padOp(op)}: n=${String(n).padStart(5)}  p50=${fmtMs(p50)}  p95=${fmtMs(p95)}  p99=${fmtMs(p99)}  max=${fmtMs(mx)}`,
        );
    }

    console.log('');
    console.log('Final collection state:');
    console.log(`  still waiting    : ${hostQueue.parties.length}`);
    console.log(`  still dining     : ${dining.parties.length}`);
    console.log(`  completed        : ${completed.parties.length}`);
    console.log(`  stats.totalJoined: ${stats.totalJoined}`);
    console.log(`  stats.stillWaiting: ${stats.stillWaiting}`);
    console.log(`  stats.partiesSeated: ${stats.partiesSeated}`);
    console.log(`  stats.noShows    : ${stats.noShows}`);

    const outcomeCounts: Record<string, number> = {};
    for (const r of dinerResults as DinerResult[]) {
        outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] ?? 0) + 1;
    }
    console.log('  diner outcomes   :', outcomeCounts);

    // ---- Assertions ----
    const A = new Assertions();

    // A1: no service errors.
    A.record('A1 no service errors', report.errors.length === 0, `${report.errors.length} errors`);

    // A2: conservation — every successful join landed in exactly one bucket.
    const totalBuckets =
        hostQueue.parties.length + dining.parties.length + completed.parties.length;
    A.record(
        'A2 conservation (joins = waiting + dining + complete)',
        report.counts.joins === totalBuckets,
        `joins=${report.counts.joins} buckets=${totalBuckets}`,
    );

    // A3: queue positions 1..N with no gaps or dupes.
    const positions = [...hostQueue.parties.map((p) => p.position)].sort((a, b) => a - b);
    const expected = Array.from({ length: positions.length }, (_, i) => i + 1);
    const positionsOk = positions.length === expected.length && positions.every((p, i) => p === expected[i]);
    A.record(
        'A3 queue positions 1..N (no gaps, no dupes)',
        positionsOk,
        `positions=[${positions.join(',')}]`,
    );

    // A4: stats.totalJoined matches the join op count.
    A.record(
        'A4 stats.totalJoined == joins op count',
        stats.totalJoined === report.counts.joins,
        `stats=${stats.totalJoined} ops=${report.counts.joins}`,
    );

    // A5: HostStats.partiesSeated + noShows <= totalJoined (some may still be waiting).
    //     AND the numbers are in the right ballpark vs our own op counters.
    A.record(
        'A5 stats.partiesSeated + noShows <= totalJoined',
        stats.partiesSeated + stats.noShows <= stats.totalJoined,
        `seated=${stats.partiesSeated} noShows=${stats.noShows} total=${stats.totalJoined}`,
    );
    A.record(
        'A5b stats.partiesSeated >= op counter for seats with successful transition',
        stats.partiesSeated >= report.counts.seats - 2, // allow a ±2 timing slack
        `stats=${stats.partiesSeated} ops=${report.counts.seats}`,
    );

    // A6: no two currently-dining parties share a table number.
    const diningTables = dining.parties
        .map((p) => p.tableNumber)
        .filter((t): t is number => typeof t === 'number');
    const uniqueTables = new Set(diningTables);
    A.record(
        'A6 no table-number collisions in currently-dining parties',
        diningTables.length === uniqueTables.size,
        `tables=${diningTables.length} unique=${uniqueTables.size}`,
    );

    // A7: every completed/dining party has the timestamps we expect for their state.
    const db = await getDb();
    const rawEntries = await queueEntries(db).find({ locationId: LOCATION_ID }).toArray();
    let missingTs = 0;
    for (const e of rawEntries) {
        if (e.state === 'seated' || e.state === 'ordered' || e.state === 'served' || e.state === 'checkout' || e.state === 'departed') {
            if (!e.seatedAt) missingTs++;
        }
        if (e.state === 'departed' && !e.departedAt && !e.removedAt) missingTs++;
        if (e.state === 'no_show' && !e.removedAt) missingTs++;
    }
    A.record(
        'A7 no dining/terminal party is missing its required timestamps',
        missingTs === 0,
        `missing=${missingTs}`,
    );

    // A8: every diner that successfully joined is accounted for somewhere.
    const joinedOk = (dinerResults as DinerResult[]).filter((r) => r.outcome !== 'join_failed' && r.outcome !== 'timeout_join');
    const stranded = (dinerResults as DinerResult[]).filter((r) => r.outcome === 'not_found').length;
    A.record(
        'A8 no diner landed in state=not_found mid-run',
        stranded === 0,
        `stranded=${stranded}`,
    );
    A.record(
        'A8b diner join count matches report.counts.joins',
        joinedOk.length === report.counts.joins,
        `simulated_joined=${joinedOk.length} report_joined=${report.counts.joins}`,
    );

    // A9: latency p95 under budget per op.
    for (const op of opsSeen) {
        const lats = report.latencies.filter((l) => l.op === op).map((l) => l.ms);
        if (lats.length < 10) continue; // not enough samples to be meaningful
        const p95 = percentile(lats, 95);
        const budget = P95_BUDGET_MS[op];
        if (budget === undefined) continue;
        A.record(
            `A9 p95 latency for ${op} under ${budget}ms`,
            p95 <= budget,
            `p95=${p95}ms budget=${budget}ms (n=${lats.length})`,
        );
    }

    // ---- Print assertions ----
    console.log('');
    console.log('========================================');
    console.log(' Assertions');
    console.log('========================================');
    for (const r of A.results) {
        const mark = r.pass ? '\u2713' : '\u2717';
        const tag = r.pass ? 'PASS' : 'FAIL';
        console.log(`  ${mark} [${tag}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    }

    const failedCount = A.failed.length;
    console.log('');
    if (failedCount === 0) {
        console.log('========================================');
        console.log(' \u2713 ALL ASSERTIONS PASSED');
        console.log('========================================');
        process.exitCode = 0;
    } else {
        console.log('========================================');
        console.log(` \u2717 ${failedCount} ASSERTION(S) FAILED`);
        console.log('========================================');
        process.exitCode = 1;
    }
}

main()
    .catch((err) => {
        console.error('[stress] crashed:', err);
        process.exitCode = 2;
    })
    .finally(async () => {
        try {
            await closeDb();
        } catch { /* ignore teardown errors */ }
    });
