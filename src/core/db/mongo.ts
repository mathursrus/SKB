// ============================================================================
// SKB - MongoDB singleton + index bootstrapping
// ============================================================================

import { MongoClient, type Db, type Collection } from 'mongodb';

import { determineDatabaseName } from '../utils/git-utils.js';
import type { Location, QueueEntry, Settings } from '../../types/queue.js';
import type { ChatMessage } from '../../types/chat.js';

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

export function queueMessages(db: Db): Collection<ChatMessage> {
    return db.collection<ChatMessage>('queue_messages');
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
    // Backs computeDynamicTurnTime in src/services/settings.ts, which filters
    // state='departed' with both seatedAt and departedAt present and sorts by
    // departedAt desc to grab the most recent samples. Without this index, the
    // query does a COLLSCAN + in-memory sort that exceeds Mongo's 32MB sort
    // limit at production-scale collections (incident 2026-04-13, see the
    // retrospective in docs/retrospectives/). The partial filter keeps the
    // index narrow — only entries in the exact state the query targets.
    //
    // This index is required BEFORE any code calls computeDynamicTurnTime
    // against the full collection (i.e., on every request), so it ships in
    // its own commit ahead of the UX refinement that depends on it.
    await queueEntries(db).createIndex(
        { locationId: 1, state: 1, departedAt: -1 },
        {
            name: 'loc_state_departedAt',
            partialFilterExpression: { state: 'departed', departedAt: { $exists: true } },
        },
    );
    // Supports seat-conflict detection (findOne by locationId+serviceDay+state+tableNumber)
    // without triggering a collection scan. Partial filter narrows to rows that
    // actually carry a tableNumber.
    await queueEntries(db).createIndex(
        { locationId: 1, serviceDay: 1, state: 1, tableNumber: 1 },
        {
            name: 'loc_serviceDay_state_tableNumber',
            partialFilterExpression: { tableNumber: { $exists: true } },
        },
    );
    // queue_messages (host ↔ diner chat) — two indexes:
    // 1. fetch thread by entry, ordered oldest → newest
    // 2. unread inbound counts for the host list badge
    await queueMessages(db).createIndex(
        { locationId: 1, entryCode: 1, createdAt: 1 },
        { name: 'loc_code_created' },
    );
    await queueMessages(db).createIndex(
        { locationId: 1, entryCode: 1, direction: 1, readByHostAt: 1 },
        { name: 'unread_lookup' },
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
