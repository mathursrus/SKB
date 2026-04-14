// ============================================================================
// Manual seed — populate the default `skb` location with a varied mix of
// parties that have MEANINGFUL (non-zero, spaced-out) state-transition
// timestamps, so you can open the host stand in a browser and verify the
// new Waited / To Order / To Serve / To Check / To Depart columns actually
// show the expected numbers.
//
// Usage:
//   1. (Optional) kill any existing dev server on :8720
//   2. Run: `npx tsx tests/manual/seed-transitions-demo.ts`
//   3. Start the dev server: `SKB_HOST_PIN=1234 SKB_COOKIE_SECRET=dev npm run mcp`
//   4. Open http://127.0.0.1:8720/r/skb/host.html, log in with PIN 1234,
//      switch to the Seated and Complete tabs.
//
// !! This seed CLOBBERS everything in the `skb` location. It is a demo
// fixture, not a migration — do not run it against a database that has
// real waitlist data you care about. Orphans from previous test runs can
// block the seat conflict check, so the only reliable way to produce a
// deterministic fixture is to nuke everything in the target location at
// the start of each run.
// ============================================================================

import { closeDb, getDb, queueEntries, queueMessages, settings as settingsColl } from '../../src/core/db/mongo.js';
import { joinQueue, removeFromQueue } from '../../src/services/queue.js';
import { advanceParty } from '../../src/services/dining.js';
import { ensureLocation } from '../../src/services/locations.js';

const LOC = 'skb';
const LOC_NAME = 'Shri Krishna Bhavan';
const LOC_PIN = '1234';

// Phones used by this seed, kept for traceability / grep.
const DEMO_PHONES = [
    '2065558001', '2065558002', '2065558003',
    '2065558004', '2065558005', '2065558006', '2065558007',
];

async function resetDemoRows(): Promise<void> {
    const db = await getDb();
    // Wipe EVERYTHING in the skb location — orphans from earlier test runs
    // will silently block seat-conflict scans otherwise, and
    // `removeFromQueue` returns `{ ok: false, conflict }` without throwing,
    // so failed seats would never surface.
    const queueRes = await queueEntries(db).deleteMany({ locationId: LOC });
    const chatRes = await queueMessages(db).deleteMany({ locationId: LOC });
    if (queueRes.deletedCount > 0 || chatRes.deletedCount > 0) {
        console.log(`  cleared ${queueRes.deletedCount} queue_entries + ${chatRes.deletedCount} queue_messages rows in '${LOC}'`);
    }
}

async function seedParty(
    name: string,
    phone: string,
    joinAt: Date,
    transitions: Array<{ state: 'seated' | 'ordered' | 'served' | 'checkout' | 'departed'; at: Date; tableNumber?: number }>,
): Promise<void> {
    await joinQueue(LOC, { name, partySize: 2, phone }, joinAt);
    const db = await getDb();
    const doc = await queueEntries(db).findOne({ locationId: LOC, phone });
    if (!doc) throw new Error(`seed party ${name} not found after join`);
    const id = String(doc._id);
    for (const t of transitions) {
        if (t.state === 'seated') {
            // `override: true` belt-and-suspenders in case the full wipe
            // in resetDemoRows somehow didn't land — we never want a silent
            // seat-conflict failure to corrupt the fixture.
            const result = await removeFromQueue(id, 'seated', { tableNumber: t.tableNumber ?? 1, override: true }, t.at);
            if (!result.ok) {
                throw new Error(`seat ${name} → table ${t.tableNumber} failed: ${JSON.stringify(result)}`);
            }
        } else {
            const result = await advanceParty(id, t.state, t.at);
            if (!result.ok) {
                throw new Error(`advance ${name} → ${t.state} failed: ${JSON.stringify(result)}`);
            }
        }
    }
}

async function seedNoShow(name: string, phone: string, joinAt: Date, removedAt: Date): Promise<void> {
    await joinQueue(LOC, { name, partySize: 2, phone }, joinAt);
    const db = await getDb();
    const doc = await queueEntries(db).findOne({ locationId: LOC, phone });
    if (!doc) throw new Error(`seed no-show ${name} not found after join`);
    const result = await removeFromQueue(String(doc._id), 'no_show', {}, removedAt);
    if (!result.ok) {
        throw new Error(`no-show ${name} failed: ${JSON.stringify(result)}`);
    }
}

async function main(): Promise<void> {
    const db = await getDb();
    console.log(`Mongo db: ${db.databaseName}`);
    console.log(`Location: ${LOC}  (PIN ${LOC_PIN})`);
    console.log('');

    await ensureLocation(LOC, LOC_NAME, LOC_PIN);
    await resetDemoRows();

    // Make sure Settings exists so ETA calculations don't crash.
    await settingsColl(db).updateOne(
        { _id: LOC },
        { $setOnInsert: { _id: LOC, avgTurnTimeMinutes: 30, updatedAt: new Date() } },
        { upsert: true },
    );

    // All timestamps are relative to "now" so the durations are meaningful
    // no matter when the seed runs.
    const now = new Date();
    const ago = (mins: number): Date => new Date(now.getTime() - mins * 60_000);

    console.log('Seeding demo parties...');
    console.log('');

    // ----- SEATED TAB — one party in each state, with realistic timings -----

    // Alice: just seated — still in 'seated' state
    // joined 20m ago, seated 5m ago → Waited 15m
    await seedParty('Alice Kim', DEMO_PHONES[0], ago(20), [
        { state: 'seated', at: ago(5), tableNumber: 3 },
    ]);
    console.log('  Alice Kim            state=seated    Waited=15m');

    // Bob: has ordered
    // joined 35m ago, seated 25m ago (Waited 10), ordered 22m ago (To Order 3)
    await seedParty('Bob Nguyen', DEMO_PHONES[1], ago(35), [
        { state: 'seated', at: ago(25), tableNumber: 5 },
        { state: 'ordered', at: ago(22) },
    ]);
    console.log('  Bob Nguyen           state=ordered   Waited=10m  ToOrder=3m');

    // Charlie: food has been served, still eating
    // joined 55m ago, seated 40m ago (W=15), ordered 34m (TO=6), served 20m (TS=14)
    await seedParty('Charlie Okafor', DEMO_PHONES[2], ago(55), [
        { state: 'seated', at: ago(40), tableNumber: 8 },
        { state: 'ordered', at: ago(34) },
        { state: 'served', at: ago(20) },
    ]);
    console.log('  Charlie Okafor       state=served    Waited=15m  ToOrder=6m  ToServe=14m');

    // Diana: asked for the bill, still at table
    // joined 90m ago, seated 75m (W=15), ordered 72m (TO=3), served 55m (TS=17),
    //   checkout 5m ago (TC=50)
    await seedParty('Diana Patel', DEMO_PHONES[3], ago(90), [
        { state: 'seated', at: ago(75), tableNumber: 11 },
        { state: 'ordered', at: ago(72) },
        { state: 'served', at: ago(55) },
        { state: 'checkout', at: ago(5) },
    ]);
    console.log('  Diana Patel          state=checkout  Waited=15m  ToOrder=3m  ToServe=17m  ToCheck=50m');

    // ----- COMPLETE TAB — departed + no-show -----

    // Eve: full lifecycle, now departed
    // joined 120m ago, seated 100m (W=20), ordered 95m (TO=5), served 75m (TS=20),
    //   checkout 35m (TC=40), departed 30m (TD=5)
    await seedParty('Eve Williams', DEMO_PHONES[4], ago(120), [
        { state: 'seated', at: ago(100), tableNumber: 14 },
        { state: 'ordered', at: ago(95) },
        { state: 'served', at: ago(75) },
        { state: 'checkout', at: ago(35) },
        { state: 'departed', at: ago(30) },
    ]);
    console.log('  Eve Williams         state=departed  Waited=20m  ToOrder=5m  ToServe=20m  ToCheck=40m  ToDepart=5m');

    // Frank: no-show — waited 25m before being removed
    await seedNoShow('Frank Ortega', DEMO_PHONES[5], ago(150), ago(125));
    console.log('  Frank Ortega         state=no_show   Waited=25m  (all post-seat cells dashed)');

    // Gina: edge case — seated then served directly (host skipped 'ordered')
    // joined 200m ago, seated 185m (W=15), served 170m (orderedAt missing),
    //   checkout 45m (TC = 170 - 45 = 125, but computed from servedAt → checkoutAt),
    //   departed 40m (TD=5)
    await seedParty('Gina Liu', DEMO_PHONES[6], ago(200), [
        { state: 'seated', at: ago(185), tableNumber: 17 },
        { state: 'served', at: ago(170) },
        { state: 'checkout', at: ago(45) },
        { state: 'departed', at: ago(40) },
    ]);
    console.log('  Gina Liu             state=departed  Waited=15m  ToOrder=—   ToServe=—   ToCheck=125m  ToDepart=5m');

    console.log('');
    console.log('Done. Start the dev server and open:');
    console.log('  http://127.0.0.1:8720/r/skb/host.html   (PIN 1234)');
    console.log('');
    console.log('Expected:');
    console.log('  Seated tab:   4 rows (Alice, Bob, Charlie, Diana)');
    console.log('  Complete tab: 3 rows (Gina, Frank, Eve) — newest first');
}

main()
    .catch((err) => {
        console.error('[seed-transitions-demo] error:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await closeDb();
        } catch { /* ignore */ }
    });
