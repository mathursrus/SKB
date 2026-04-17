// ============================================================================
// Integration tests for the per-state-transition duration fields on
// HostDiningPartyDTO (Seated tab) and HostCompletedPartyDTO (Complete tab).
// ============================================================================
//
// Exercises listDiningParties and listCompletedParties with explicit `now`
// timestamps so every transition has a known, non-zero duration we can
// assert against. Covers:
//
//   - State-by-state: a party currently in `seated` / `ordered` / `served` /
//     `checkout` returns only the transitions it's actually reached.
//   - Full lifecycle: a departed party has all 5 transitions filled.
//   - No-show: waitTimeMinutes filled, all post-seat transitions null.
//   - Skipped state: `seated → served` directly means toOrderMinutes AND
//     toServeMinutes are null (the latter has no `orderedAt` baseline).
//   - Numeric correctness: durations match the gaps we seeded.
// ============================================================================

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_dining_transitions_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings as settingsColl } from '../../src/core/db/mongo.js';
import { joinQueue, removeFromQueue } from '../../src/services/queue.js';
import { advanceParty, listDiningParties, listCompletedParties } from '../../src/services/dining.js';

const LOC = 'trans-test';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({ locationId: LOC });
    await settingsColl(db).deleteOne({ _id: LOC });
}

/**
 * Seed one party at `joinAt` and walk it through a specific sequence of
 * transitions, each at its own timestamp. Returns the party id.
 *
 * states is an array like ['seated', 'ordered', 'served', 'checkout'] —
 * the party will be advanced to each in order, at the corresponding
 * timestamp. The first entry must be 'seated'.
 */
async function seedParty(
    name: string,
    phone: string,
    joinAt: Date,
    transitions: Array<{ state: 'seated' | 'ordered' | 'served' | 'checkout' | 'departed'; at: Date; tableNumber?: number }>,
): Promise<string> {
    await joinQueue(LOC, { name, partySize: 2, phone }, joinAt);
    const db = await getDb();
    const doc = await queueEntries(db).findOne({ locationId: LOC, name });
    const id = String(doc!._id);
    for (const t of transitions) {
        if (t.state === 'seated') {
            await removeFromQueue(id, 'seated', { tableNumber: t.tableNumber ?? 1 }, t.at);
        } else {
            await advanceParty(id, t.state, t.at);
        }
    }
    return id;
}

/**
 * Seed a no-show party: joined then removed with reason='no_show' at `removedAt`.
 */
async function seedNoShow(name: string, phone: string, joinAt: Date, removedAt: Date): Promise<string> {
    await joinQueue(LOC, { name, partySize: 2, phone }, joinAt);
    const db = await getDb();
    const doc = await queueEntries(db).findOne({ locationId: LOC, name });
    const id = String(doc!._id);
    await removeFromQueue(id, 'no_show', {}, removedAt);
    return id;
}

/** Minutes between two Date instances. */
function mins(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 60_000);
}

// A fixed baseline "now" used by each test so numbers are stable and
// durations don't depend on wall-clock drift.
const BASE = new Date('2026-04-14T18:00:00Z');
function plus(minutes: number): Date {
    return new Date(BASE.getTime() + minutes * 60_000);
}

const cases: BaseTestCase[] = [
    // ---------- Seated tab — each state ----------
    {
        name: 'listDiningParties: seated-only — waitMinutes filled, rest null',
        tags: ['integration', 'dining', 'transitions'],
        testFn: async () => {
            await resetDb();
            // joined at t=0, seated at t=15 (wait = 15m)
            await seedParty('Alice', '2065550001', plus(0), [
                { state: 'seated', at: plus(15), tableNumber: 1 },
            ]);
            const list = await listDiningParties(LOC, plus(20));
            const p = list.parties[0];
            return p
                && p.waitMinutes === 15
                && p.toOrderMinutes === null
                && p.toServeMinutes === null
                && p.toCheckoutMinutes === null
                && p.state === 'seated';
        },
    },
    {
        name: 'listDiningParties: ordered — wait + toOrder filled, toServe/toCheckout null',
        tags: ['integration', 'dining', 'transitions'],
        testFn: async () => {
            await resetDb();
            await seedParty('Bob', '2065550002', plus(0), [
                { state: 'seated', at: plus(15), tableNumber: 2 },
                { state: 'ordered', at: plus(20) }, // 5m after seated
            ]);
            const list = await listDiningParties(LOC, plus(25));
            const p = list.parties[0];
            return p
                && p.waitMinutes === 15
                && p.toOrderMinutes === 5
                && p.toServeMinutes === null
                && p.toCheckoutMinutes === null
                && p.state === 'ordered';
        },
    },
    {
        name: 'listDiningParties: served — wait + toOrder + toServe filled, toCheckout null',
        tags: ['integration', 'dining', 'transitions'],
        testFn: async () => {
            await resetDb();
            await seedParty('Charlie', '2065550003', plus(0), [
                { state: 'seated', at: plus(10), tableNumber: 3 },
                { state: 'ordered', at: plus(13) }, // +3
                { state: 'served', at: plus(25) },  // +12
            ]);
            const list = await listDiningParties(LOC, plus(30));
            const p = list.parties[0];
            return p
                && p.waitMinutes === 10
                && p.toOrderMinutes === 3
                && p.toServeMinutes === 12
                && p.toCheckoutMinutes === null
                && p.state === 'served';
        },
    },
    {
        name: 'listDiningParties: checkout — all four transit fields filled',
        tags: ['integration', 'dining', 'transitions'],
        testFn: async () => {
            await resetDb();
            await seedParty('Diana', '2065550004', plus(0), [
                { state: 'seated', at: plus(12), tableNumber: 4 },
                { state: 'ordered', at: plus(17) },   // +5
                { state: 'served', at: plus(30) },    // +13
                { state: 'checkout', at: plus(68) },  // +38
            ]);
            const list = await listDiningParties(LOC, plus(75));
            const p = list.parties[0];
            return p
                && p.waitMinutes === 12
                && p.toOrderMinutes === 5
                && p.toServeMinutes === 13
                && p.toCheckoutMinutes === 38
                && p.state === 'checkout';
        },
    },

    // ---------- Seated tab — skipped state ----------
    {
        name: 'listDiningParties: seated → served (skipped ordered) — toOrder AND toServe null',
        tags: ['integration', 'dining', 'transitions', 'skip'],
        testFn: async () => {
            // If the host skips the `ordered` state, the entry has a seatedAt
            // and a servedAt but no orderedAt. The formula for toServe is
            // `servedAt - orderedAt`, so with no orderedAt we have no
            // meaningful intermediate duration to report — we return null.
            // toOrder is obviously null too (never ordered).
            await resetDb();
            await seedParty('Ellen', '2065550005', plus(0), [
                { state: 'seated', at: plus(10), tableNumber: 5 },
                { state: 'served', at: plus(25) }, // skipped ordered
            ]);
            const list = await listDiningParties(LOC, plus(30));
            const p = list.parties[0];
            return p
                && p.waitMinutes === 10
                && p.toOrderMinutes === null
                && p.toServeMinutes === null
                && p.toCheckoutMinutes === null
                && p.state === 'served';
        },
    },

    // ---------- Complete tab — full lifecycle ----------
    {
        name: 'listCompletedParties: full lifecycle — all 5 transit fields filled',
        tags: ['integration', 'completed', 'transitions'],
        testFn: async () => {
            await resetDb();
            await seedParty('Frank', '2065550006', plus(0), [
                { state: 'seated', at: plus(10), tableNumber: 6 },   // wait = 10
                { state: 'ordered', at: plus(14) },                  // toOrder = 4
                { state: 'served', at: plus(24) },                   // toServe = 10
                { state: 'checkout', at: plus(60) },                 // toCheckout = 36
                { state: 'departed', at: plus(63) },                 // toDepart = 3
            ]);
            const list = await listCompletedParties(LOC, plus(70));
            const p = list.parties[0];
            return p
                && p.state === 'departed'
                && p.waitTimeMinutes === 10
                && p.toOrderMinutes === 4
                && p.toServeMinutes === 10
                && p.toCheckoutMinutes === 36
                && p.toDepartMinutes === 3
                // Existing fields should still be correct.
                && p.tableTimeMinutes === 53   // seated → departed = 63 - 10 = 53
                && p.totalTimeMinutes === 63;  // joined → departed = 63
        },
    },

    // ---------- Complete tab — no-show ----------
    {
        name: 'listCompletedParties: no-show — waitTimeMinutes filled, all post-seat null',
        tags: ['integration', 'completed', 'transitions', 'no-show'],
        testFn: async () => {
            await resetDb();
            // Joined at t=0, marked no-show at t=18 (waited 18m then removed).
            await seedNoShow('Gina', '2065550007', plus(0), plus(18));
            const list = await listCompletedParties(LOC, plus(20));
            const p = list.parties[0];
            return p
                && p.state === 'no_show'
                && p.waitTimeMinutes === 18
                && p.toOrderMinutes === null
                && p.toServeMinutes === null
                && p.toCheckoutMinutes === null
                && p.toDepartMinutes === null
                && p.tableTimeMinutes === null
                && p.totalTimeMinutes === 18;
        },
    },

    // ---------- Complete tab — departed with a skipped state ----------
    {
        name: 'listCompletedParties: departed but skipped ordered — toOrder null, toServe null, others filled',
        tags: ['integration', 'completed', 'transitions', 'skip'],
        testFn: async () => {
            await resetDb();
            await seedParty('Henry', '2065550008', plus(0), [
                { state: 'seated', at: plus(5), tableNumber: 7 },  // wait = 5
                { state: 'served', at: plus(20) },                 // skipped ordered
                { state: 'checkout', at: plus(50) },               // toCheckout = 30
                { state: 'departed', at: plus(52) },               // toDepart = 2
            ]);
            const list = await listCompletedParties(LOC, plus(55));
            const p = list.parties[0];
            return p
                && p.state === 'departed'
                && p.waitTimeMinutes === 5
                && p.toOrderMinutes === null   // no orderedAt
                && p.toServeMinutes === null   // no orderedAt to subtract from
                && p.toCheckoutMinutes === 30
                && p.toDepartMinutes === 2;
        },
    },

    // ---------- Sorting / multi-party sanity ----------
    {
        name: 'listDiningParties: multi-party list preserves correct durations per row',
        tags: ['integration', 'dining', 'transitions'],
        testFn: async () => {
            await resetDb();
            // Three parties in different stages, seeded in parallel.
            await seedParty('P-seated',   '2065550010', plus(0), [
                { state: 'seated', at: plus(20), tableNumber: 10 }, // wait=20
            ]);
            await seedParty('P-ordered',  '2065550011', plus(0), [
                { state: 'seated', at: plus(30), tableNumber: 11 }, // wait=30
                { state: 'ordered', at: plus(33) },                 // toOrder=3
            ]);
            await seedParty('P-served',   '2065550012', plus(0), [
                { state: 'seated', at: plus(40), tableNumber: 12 }, // wait=40
                { state: 'ordered', at: plus(50) },                 // toOrder=10
                { state: 'served', at: plus(65) },                  // toServe=15
            ]);
            const list = await listDiningParties(LOC, plus(80));
            const byName = Object.fromEntries(list.parties.map((p) => [p.name, p]));

            const s = byName['P-seated'];
            const o = byName['P-ordered'];
            const sv = byName['P-served'];

            return list.parties.length === 3
                // seated-only
                && s.waitMinutes === 20
                && s.toOrderMinutes === null
                && s.toServeMinutes === null
                && s.toCheckoutMinutes === null
                // ordered
                && o.waitMinutes === 30
                && o.toOrderMinutes === 3
                && o.toServeMinutes === null
                && o.toCheckoutMinutes === null
                // served
                && sv.waitMinutes === 40
                && sv.toOrderMinutes === 10
                && sv.toServeMinutes === 15
                && sv.toCheckoutMinutes === null;
        },
    },

    // ---------- Regression: existing fields still correct ----------
    {
        name: 'listDiningParties: timeInStateMinutes and totalTableMinutes are still correct',
        tags: ['integration', 'dining', 'regression'],
        testFn: async () => {
            await resetDb();
            await seedParty('Iris', '2065550013', plus(0), [
                { state: 'seated', at: plus(10), tableNumber: 13 },
                { state: 'ordered', at: plus(14) },
            ]);
            // Query at t=20: party has been in 'ordered' for 6 minutes
            // (20 - 14), and at the table for 10 minutes (20 - 10).
            const list = await listDiningParties(LOC, plus(20));
            const p = list.parties[0];
            return p
                && p.timeInStateMinutes === 6
                && p.totalTableMinutes === 10
                && p.waitMinutes === 10
                && p.toOrderMinutes === 4;
        },
    },

    {
        name: 'listCompletedParties: aggregate avgWait + avgTableOccupancy unaffected by new fields',
        tags: ['integration', 'completed', 'regression'],
        testFn: async () => {
            await resetDb();
            // Two departed + one no-show.
            await seedParty('A', '2065550020', plus(0), [
                { state: 'seated', at: plus(10), tableNumber: 20 },   // wait=10
                { state: 'ordered', at: plus(15) },
                { state: 'served', at: plus(25) },
                { state: 'checkout', at: plus(50) },
                { state: 'departed', at: plus(52) },                  // table=42
            ]);
            await seedParty('B', '2065550021', plus(0), [
                { state: 'seated', at: plus(20), tableNumber: 21 },   // wait=20
                { state: 'ordered', at: plus(22) },
                { state: 'served', at: plus(35) },
                { state: 'checkout', at: plus(60) },
                { state: 'departed', at: plus(63) },                  // table=43
            ]);
            await seedNoShow('C', '2065550022', plus(0), plus(15));   // wait=15, no table

            const list = await listCompletedParties(LOC, plus(65));
            // Avg wait across the two that were seated = (10 + 20) / 2 = 15
            // Avg table = (42 + 43) / 2 = 42.5 → 43 (rounded)
            return list.totalServed === 2
                && list.totalNoShows === 1
                && list.avgWaitMinutes === 15
                && list.avgTableOccupancyMinutes !== null
                && Math.abs((list.avgTableOccupancyMinutes ?? 0) - 43) <= 1;
        },
    },
];

// Teardown as the final test case — keeps npm run test:all from hanging.
// See commit 539b8f7 for context on why main()+finally leaves the Node
// process stuck after closeDb() resolves.
cases.push({
    name: 'teardown',
    tags: ['integration', 'dining', 'teardown'],
    testFn: async () => { await closeDb(); return true; },
});

void runTests(cases, 'Dining Transition Durations Integration');
