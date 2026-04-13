// ============================================================================
// SKB - MongoDB singleton + index bootstrapping
// ============================================================================

import { MongoClient, type Db, type Collection } from 'mongodb';

import { determineDatabaseName } from '../utils/git-utils.js';
import type { Location, QueueEntry, Settings } from '../../types/queue.js';

let client: MongoClient | null = null;
let db: Db | null = null;
let bootstrapped = false;

function getUri(): string {
    return process.env.MONGODB_URI || 'mongodb://localhost:27017';
}

export async function getDb(): Promise<Db> {
    if (db) return db;
    if (!client) {
        client = new MongoClient(getUri(), {
            serverSelectionTimeoutMS: 3000,
        });
        await client.connect();
    }
    db = client.db(determineDatabaseName());
    if (!bootstrapped) {
        await bootstrapIndexes(db);
        bootstrapped = true;
    }
    return db;
}

export function queueEntries(db: Db): Collection<QueueEntry> {
    return db.collection<QueueEntry>('queue_entries');
}

export function settings(db: Db): Collection<Settings> {
    return db.collection<Settings>('settings');
}

export function locations(db: Db): Collection<Location> {
    return db.collection<Location>('locations');
}

async function bootstrapIndexes(db: Db): Promise<void> {
    await queueEntries(db).createIndex(
        { locationId: 1, serviceDay: 1, state: 1, joinedAt: 1 },
        { name: 'loc_serviceDay_state_joinedAt' },
    );
    await queueEntries(db).createIndex(
        { code: 1 },
        { name: 'code_unique', unique: true },
    );
    // Backs computeDynamicTurnTime: find by locationId + state='departed', sort by departedAt desc.
    // Without this, prod collection scans + in-memory sorts crashed every ETA-computing endpoint
    // (incident 2026-04-13). Partial filter keeps the index narrow.
    await queueEntries(db).createIndex(
        { locationId: 1, state: 1, departedAt: -1 },
        {
            name: 'loc_state_departedAt',
            partialFilterExpression: { state: 'departed', departedAt: { $exists: true } },
        },
    );
}

export async function closeDb(): Promise<void> {
    if (client) {
        await client.close();
        client = null;
        db = null;
        bootstrapped = false;
    }
}

/** Quick liveness probe; throws if Mongo is not reachable within ~1s. */
export async function pingDb(): Promise<void> {
    const d = await getDb();
    await d.command({ ping: 1 }, { timeoutMS: 1000 });
}
