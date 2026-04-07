// ============================================================================
// SKB - Seed "skb-demo" location with 60 days of synthetic lifecycle data
// ============================================================================
//
// Story arc:
// - Days 1-20: Bad period. Long waits (25-35m avg), high no-shows (15%),
//   slow kitchen (20-25m), slow ordering (12-15m). ~30 parties/day.
// - Days 21-40: Improving. Waits drop to 15-20m, no-shows 10%, kitchen
//   speeds up to 15-18m, ordering 8-10m. ~35 parties/day.
// - Days 41-60: Optimized. Waits 8-12m, no-shows 5%, kitchen 10-14m,
//   ordering 5-8m. ~40 parties/day.
//
// Run: npx tsx scripts/seed-demo.ts
// ============================================================================

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'skb_prod';
const LOCATION_ID = 'skb-demo';
const LOCATION_NAME = 'SKB Demo Restaurant';
const LOCATION_PIN = 'demo1234';

const NAMES = [
    'Asha', 'Ravi', 'Priya', 'Kumar', 'Meena', 'Vijay', 'Deepa', 'Anand',
    'Lakshmi', 'Hegde', 'Bhavya', 'Chandra', 'Ganesh', 'Kavitha', 'Suresh',
    'Rekha', 'Mohan', 'Divya', 'Rajesh', 'Sunita', 'Prakash', 'Nandini',
    'Venkat', 'Padma', 'Arun', 'Geetha', 'Srinivas', 'Usha', 'Ramesh', 'Jaya',
];

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateCode(): string {
    let s = '';
    for (let i = 0; i < 3; i++) s += ALPHABET[randomInt(0, ALPHABET.length - 1)];
    return `SKB-${s}`;
}

function serviceDay(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
}

function addMin(d: Date, m: number): Date {
    return new Date(d.getTime() + m * 60_000);
}

/** Gaussian-ish random with mean and stddev, clamped to [min, max]. */
function gaussRandom(mean: number, std: number, min: number, max: number): number {
    // Box-Muller
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(min, Math.min(max, Math.round(mean + z * std)));
}

interface PhaseConfig {
    waitMean: number; waitStd: number;
    orderMean: number; orderStd: number;
    kitchenMean: number; kitchenStd: number;
    eatingMean: number; eatingStd: number;
    checkoutMean: number; checkoutStd: number;
    noShowRate: number;
    partiesPerDay: number;
}

function getPhaseConfig(dayIndex: number): PhaseConfig {
    if (dayIndex < 20) {
        // Bad period
        return {
            waitMean: 30, waitStd: 6,
            orderMean: 13, orderStd: 3,
            kitchenMean: 22, kitchenStd: 4,
            eatingMean: 18, eatingStd: 5,
            checkoutMean: 8, checkoutStd: 2,
            noShowRate: 0.15,
            partiesPerDay: randomInt(25, 35),
        };
    } else if (dayIndex < 40) {
        // Improving
        return {
            waitMean: 18, waitStd: 4,
            orderMean: 9, orderStd: 2,
            kitchenMean: 16, kitchenStd: 3,
            eatingMean: 16, eatingStd: 4,
            checkoutMean: 6, checkoutStd: 2,
            noShowRate: 0.10,
            partiesPerDay: randomInt(30, 40),
        };
    } else {
        // Optimized
        return {
            waitMean: 10, waitStd: 3,
            orderMean: 6, orderStd: 2,
            kitchenMean: 12, kitchenStd: 3,
            eatingMean: 15, eatingStd: 4,
            checkoutMean: 5, checkoutStd: 1,
            noShowRate: 0.05,
            partiesPerDay: randomInt(35, 45),
        };
    }
}

interface Entry {
    locationId: string;
    code: string;
    name: string;
    partySize: number;
    phoneLast4?: string;
    state: string;
    joinedAt: Date;
    promisedEtaAt: Date;
    serviceDay: string;
    calls?: Date[];
    seatedAt?: Date;
    orderedAt?: Date;
    servedAt?: Date;
    checkoutAt?: Date;
    departedAt?: Date;
    removedAt?: Date;
    removedReason?: string;
}

async function main() {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(DB_NAME);
    const coll = db.collection('queue_entries');
    const locColl = db.collection('locations');
    const settingsColl = db.collection('settings');

    // Clean existing demo data
    const deleted = await coll.deleteMany({ locationId: LOCATION_ID });
    console.log(`Deleted ${deleted.deletedCount} existing skb-demo entries`);

    // Ensure location
    await locColl.updateOne(
        { _id: LOCATION_ID },
        { $set: { _id: LOCATION_ID, name: LOCATION_NAME, pin: LOCATION_PIN, createdAt: new Date() } },
        { upsert: true },
    );
    console.log(`Location '${LOCATION_ID}' ensured`);

    // Ensure settings
    await settingsColl.updateOne(
        { _id: LOCATION_ID },
        { $set: { _id: LOCATION_ID, avgTurnTimeMinutes: 8, updatedAt: new Date() } },
        { upsert: true },
    );

    const now = new Date();
    const entries: Entry[] = [];
    const usedCodes = new Set<string>();

    for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
        const dayStart = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
        // Set to 11:00 AM PT (18:00 UTC) as restaurant opening
        dayStart.setUTCHours(18, 0, 0, 0);
        const day = serviceDay(dayStart);

        const config = getPhaseConfig(59 - dayOffset); // day 0 = earliest
        const numParties = config.partiesPerDay;

        for (let p = 0; p < numParties; p++) {
            // Stagger arrivals over 5 hours (11AM-4PM PT, peak at 12-1PM)
            const arrivalOffset = gaussRandom(120, 60, 0, 300); // minutes from open
            const joinedAt = addMin(dayStart, arrivalOffset);

            let code: string;
            do { code = generateCode(); } while (usedCodes.has(code));
            usedCodes.add(code);

            const name = randomChoice(NAMES);
            const partySize = randomInt(1, 8);
            // Larger parties wait longer
            const sizeMultiplier = partySize <= 2 ? 0.8 : partySize <= 4 ? 1.0 : 1.3;

            const isNoShow = Math.random() < config.noShowRate;

            if (isNoShow) {
                const waitMin = gaussRandom(config.waitMean * sizeMultiplier, config.waitStd, 3, 50);
                entries.push({
                    locationId: LOCATION_ID,
                    code, name, partySize,
                    phoneLast4: Math.random() > 0.5 ? String(randomInt(1000, 9999)) : undefined,
                    state: 'no_show',
                    joinedAt,
                    promisedEtaAt: addMin(joinedAt, waitMin),
                    serviceDay: day,
                    calls: [addMin(joinedAt, waitMin - 2)],
                    removedAt: addMin(joinedAt, waitMin),
                    removedReason: 'no_show',
                });
                continue;
            }

            // Full lifecycle
            const waitMin = gaussRandom(config.waitMean * sizeMultiplier, config.waitStd, 2, 45);
            const calledAt = addMin(joinedAt, Math.max(1, waitMin - 3));
            const seatedAt = addMin(joinedAt, waitMin);
            const orderMin = gaussRandom(config.orderMean * sizeMultiplier, config.orderStd, 2, 25);
            const orderedAt = addMin(seatedAt, orderMin);
            const kitchenMin = gaussRandom(config.kitchenMean * sizeMultiplier, config.kitchenStd, 5, 40);
            const servedAt = addMin(orderedAt, kitchenMin);
            const eatingMin = gaussRandom(config.eatingMean, config.eatingStd, 8, 35);
            const checkoutAt = addMin(servedAt, eatingMin);
            const checkoutMin = gaussRandom(config.checkoutMean, config.checkoutStd, 2, 15);
            const departedAt = addMin(checkoutAt, checkoutMin);

            entries.push({
                locationId: LOCATION_ID,
                code, name, partySize,
                phoneLast4: Math.random() > 0.4 ? String(randomInt(1000, 9999)) : undefined,
                state: 'departed',
                joinedAt,
                promisedEtaAt: addMin(joinedAt, waitMin),
                serviceDay: day,
                calls: [calledAt],
                seatedAt,
                orderedAt,
                servedAt,
                checkoutAt,
                departedAt,
                removedAt: departedAt,
                removedReason: 'departed',
            });
        }
    }

    // Batch insert
    if (entries.length > 0) {
        await coll.insertMany(entries);
    }

    console.log(`Inserted ${entries.length} entries across 60 days`);

    // Print summary
    const phases = [0, 20, 40];
    for (const start of phases) {
        const slice = entries.filter((_, i) => {
            const dayIdx = Math.floor(i / 35); // rough
            return dayIdx >= start && dayIdx < start + 20;
        });
        const seated = slice.filter(e => e.state === 'departed');
        const noShows = slice.filter(e => e.state === 'no_show');
        const avgWait = seated.length > 0
            ? Math.round(seated.reduce((a, e) => a + (e.seatedAt!.getTime() - e.joinedAt.getTime()) / 60_000, 0) / seated.length)
            : 0;
        console.log(`  Days ${start}-${start + 19}: ${slice.length} parties, ${noShows.length} no-shows (${Math.round(noShows.length / slice.length * 100)}%), avg wait ${avgWait}m`);
    }

    await client.close();
    console.log('Done!');
}

main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
