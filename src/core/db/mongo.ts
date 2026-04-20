// ============================================================================
// SKB - MongoDB singleton + index bootstrapping
// ============================================================================

import { MongoClient, type Db, type Collection } from 'mongodb';

import { determineDatabaseName } from '../utils/git-utils.js';
import type { Location, QueueEntry, Settings, GuestCartLineDTO } from '../../types/queue.js';
import type { ChatMessage } from '../../types/chat.js';
import type { User, Membership, PasswordReset, Invite } from '../../types/identity.js';
import type { GoogleToken } from '../../services/googleBusiness.js';

export interface PartyOrder {
    locationId: string;
    code: string;
    serviceDay: string;
    entryId: string;
    state: 'draft' | 'placed';
    lines: GuestCartLineDTO[];
    totalQuantity: number;
    updatedAt: Date;
    placedAt?: Date;
}

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

export function users(db: Db): Collection<User> {
    return db.collection<User>('users');
}

export function memberships(db: Db): Collection<Membership> {
    return db.collection<Membership>('memberships');
}

export function passwordResets(db: Db): Collection<PasswordReset> {
    return db.collection<PasswordReset>('password_resets');
}

export function invites(db: Db): Collection<Invite> {
    return db.collection<Invite>('invites');
}

export function googleTokens(db: Db): Collection<GoogleToken> {
    return db.collection<GoogleToken>('google_tokens');
}

export function partyOrders(db: Db): Collection<PartyOrder> {
    return db.collection<PartyOrder>('party_orders');
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
    await partyOrders(db).createIndex(
        { code: 1 },
        { name: 'party_order_code_unique', unique: true },
    );
    await partyOrders(db).createIndex(
        { locationId: 1, serviceDay: 1, state: 1, updatedAt: -1 },
        { name: 'party_order_loc_day_state_updated' },
    );
    await partyOrders(db).createIndex(
        { entryId: 1 },
        { name: 'party_order_entry_id' },
    );

    // Identity collections (issue #53):
    //
    // - users.email: unique lowercased natural key. Ships in front of the
    //   application-level lowercasing so DB constraints bite even if a
    //   future code path forgets.
    // - memberships.(userId, locationId, revokedAt): one active membership
    //   per (user, location). MongoDB's partial-index expression language
    //   doesn't accept `$exists: false`, so we encode "active" by
    //   including `revokedAt` as the third key — active rows lack the
    //   field (treated as missing key value) and share a slot, while
    //   revoked rows carry a distinct Date value and are free to
    //   coexist. Result: re-inviting a previously-revoked teammate
    //   works; a concurrent duplicate insert on the active slot fails
    //   with 11000.
    // - memberships.userId: supports the "which-restaurant" picker at
    //   /api/login when a user has >1 active membership.
    // - password_resets.tokenHash: unique (token is single-use) + lookups.
    // - password_resets.expiresAt: TTL so expired tokens auto-reap.
    await users(db).createIndex(
        { email: 1 },
        { name: 'email_unique', unique: true },
    );
    await memberships(db).createIndex(
        { userId: 1, locationId: 1, revokedAt: 1 },
        {
            name: 'user_location_revoked_unique',
            unique: true,
        },
    );
    await memberships(db).createIndex(
        { userId: 1 },
        { name: 'user_memberships' },
    );
    await memberships(db).createIndex(
        { locationId: 1 },
        { name: 'location_memberships' },
    );
    await passwordResets(db).createIndex(
        { tokenHash: 1 },
        { name: 'token_unique', unique: true },
    );
    await passwordResets(db).createIndex(
        { expiresAt: 1 },
        { name: 'ttl_expiresAt', expireAfterSeconds: 0 },
    );

    // Invites (issue #55):
    //
    // - `tokenHash` is unique so POST /api/accept-invite can O(1) consume.
    // - (locationId, email, acceptedAt, revokedAt) together let us list
    //   the "active pending" invites for a location without a scan. We
    //   include acceptedAt + revokedAt as regular index keys — this
    //   doesn't enforce uniqueness but keeps the common query narrow.
    // - TTL on expiresAt so stale invites auto-reap after the 7-day
    //   window. (R3 says owners can resend; resend creates a fresh row,
    //   and the stale row disappears on TTL tick.)
    await invites(db).createIndex(
        { tokenHash: 1 },
        { name: 'invite_token_unique', unique: true },
    );
    await invites(db).createIndex(
        { locationId: 1, email: 1 },
        { name: 'invite_loc_email' },
    );
    await invites(db).createIndex(
        { expiresAt: 1 },
        {
            name: 'invite_ttl',
            // TTL reap fires when `expiresAt` is in the past AND the
            // invite hasn't been consumed. Mongo TTL indexes don't
            // support conditional reaping directly; we accept that
            // accepted invites are deleted on consume (see invites.ts)
            // and only unredeemed invites reach this TTL branch.
            expireAfterSeconds: 0,
        },
    );

    // Google Business Profile tokens (issue #51 Phase D):
    // - One row per tenant (unique on locationId). Re-connecting overwrites.
    // - refreshToken is a long-lived secret; callers must never project it
    //   back to the wire. See services/googleBusiness.ts for the
    //   toPublicGoogleToken() guard — same shape as toPublicUser().
    await googleTokens(db).createIndex(
        { locationId: 1 },
        { name: 'loc_unique', unique: true },
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
