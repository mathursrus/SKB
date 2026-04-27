// ============================================================================
// User-facing regression test for issue #93 — /staff 503 on Cosmos.
//
// Symptom (prod): owner signs in, opens Staff page or hits the iOS Staff
// section, server returns 503 {"error":"temporarily unavailable",
// "code":"db_throw"}. Local Mongo handles the same query fine, masking the
// bug from local dev.
//
// Root cause (per fraim/ai-employee/skills/azure/cosmos-db-mongodb-setup.md):
//   "Cosmos DB cannot do collection scans — queries with sort() on
//    unindexed fields will fail with an error, not just run slowly."
//
// listStaffAtLocation and listPendingInvites both .sort({createdAt:1}) but
// nothing in the bootstrap indexed `createdAt` so Cosmos rejected the query
// plan.
//
// To make this fail LOCALLY in the same shape as prod (HTTP 503 from the
// real route), this test:
//   1. Starts the real test server (child process)
//   2. Signs up an owner
//   3. Drops every memberships/invites index that the bug-affected query
//      could fall back to (everything except _id)
//   4. Sets MongoDB's `notablescan` parameter to true so any remaining
//      collection scan throws — the same shape Cosmos uses
//   5. Hits GET /r/:loc/api/staff and asserts response is 200 with the
//      owner present
//
// Before the fix: bootstrap creates only a `(locationId)` index for
// memberships. Step 3 drops it. Step 5's find scans the collection.
// notablescan rejects. The route's dbError catches and returns 503.
// Test FAILS — same as production.
//
// After the fix: bootstrap also creates `(locationId, createdAt)`. Step 3
// only drops the OLD non-compound indexes; the new compound one survives.
// Step 5's find uses the surviving index, no scan, plan also satisfies the
// sort. Route returns 200. Test PASSES — proves the fix end-to-end.
//
// Cleanup is mandatory: notablescan is a server-wide setting, so a hung
// or panicked test could break the rest of the suite if we don't reset it.
// Both the cleanup case and a try/finally inside each step handle this.
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-cosmos-sim';
process.env.MONGODB_DB_NAME ??= 'skb_cosmos_sim_93_test';
const COSMOS_SIM_PORT = String(15601 + Math.floor(Math.random() * 200));
process.env.FRAIM_TEST_SERVER_PORT ??= COSMOS_SIM_PORT;
process.env.PORT ??= COSMOS_SIM_PORT;
process.env.SKB_HOST_PIN ??= '1234';

import type { Db } from 'mongodb';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../shared-server-utils.js';
import {
    closeDb,
    getDb,
    locations,
    users as usersColl,
    memberships as membershipsColl,
    invites as invitesColl,
} from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';
import { createOwnerUser } from '../../src/services/users.js';

const LOC = 'cosmos-sim-93';
const OWNER_EMAIL = 'cosmos-sim-93-owner@example.test';
const OWNER_PASS = 'correct-horse-battery-staple-93';

let ownerCookie: string | null = null;

async function setNotablescan(db: Db, value: boolean): Promise<void> {
    await db.admin().command({ setParameter: 1, notablescan: value });
}

async function dropIndexIfExists(coll: { dropIndex: (n: string) => Promise<unknown> }, name: string): Promise<void> {
    try { await coll.dropIndex(name); } catch { /* index may not exist; ok */ }
}

function getCookie(headers: Headers, name: string): string | null {
    const raw = headers.get('set-cookie') ?? '';
    const idx = raw.indexOf(`${name}=`);
    if (idx < 0) return null;
    const end = raw.indexOf(';', idx);
    return raw.slice(idx, end === -1 ? undefined : end);
}

async function loginAs(email: string, password: string): Promise<string | null> {
    const r = await fetch(`${getTestServerUrl()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!r.ok) return null;
    return getCookie(r.headers, 'skb_session');
}

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + owner + Cosmos-strict simulation',
        tags: ['integration', 'cosmos-sim', 'issue-93', 'setup'],
        testFn: async () => {
            await startTestServer();

            // Trigger bootstrap so any indexes the code wants are created
            // before we start dropping the obsolete ones.
            const db = await getDb();

            // Wipe any prior test state.
            await locations(db).deleteMany({ _id: LOC });
            await usersColl(db).deleteMany({ email: OWNER_EMAIL });
            await membershipsColl(db).deleteMany({ locationId: LOC });
            await invitesColl(db).deleteMany({ locationId: LOC });

            await ensureLocation(LOC, 'Cosmos Sim 93', '0000');
            await createOwnerUser({
                email: OWNER_EMAIL,
                password: OWNER_PASS,
                name: 'Cosmos Owner',
                locationId: LOC,
            });

            ownerCookie = await loginAs(OWNER_EMAIL, OWNER_PASS);
            if (!ownerCookie) return false;

            // Drop ONLY the indexes that the bug-affected queries fall back
            // to in master. Leave alone:
            //   - `user_location_revoked_unique` (the auth middleware's
            //     membership recheck uses it — needs to keep working so this
            //     test exercises the SAME failure mode as prod, which is the
            //     route handler's `code: 'db_throw'`, not the middleware's
            //     `auth.membership-lookup.error`).
            //   - `user_memberships` (login picker uses it).
            //   - `invite_token_unique` (accept-invite needs it).
            //   - `invite_ttl` (TTL reaper).
            // After dropping `location_memberships` and `invite_loc_email`,
            // the buggy code's `find({locationId, ...}).sort({createdAt:1})`
            // has no usable index → COLLSCAN → notablescan throws.
            // The fix adds `(locationId, createdAt)` which we DO NOT drop —
            // so after the fix, find+sort uses it and notablescan is happy.
            await dropIndexIfExists(membershipsColl(db), 'location_memberships');
            await dropIndexIfExists(invitesColl(db), 'invite_loc_email');

            // Force MongoDB to reject any query that would do a collection
            // scan. This is the closest local proxy for Azure Cosmos DB's
            // "queries with sort() on unindexed fields will fail" behavior.
            await setNotablescan(db, true);

            return true;
        },
    },
    {
        name: 'GET /r/:loc/api/staff returns 200 with owner row (FAILS with 503 before fix)',
        tags: ['integration', 'cosmos-sim', 'issue-93', 'user-facing'],
        testFn: async () => {
            if (!ownerCookie) return false;
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff`, {
                headers: { Cookie: ownerCookie },
            });
            const body = await r.json() as {
                staff?: Array<{ email?: string; role?: string }>;
                pending?: unknown[];
                error?: string;
                code?: string;
                detail?: string;
            };
            if (r.status !== 200) {
                console.error('cosmos-sim /staff failed:', r.status, JSON.stringify(body));
                return false;
            }
            if (!Array.isArray(body.staff)) return false;
            const owner = body.staff.find((s) => s.email === OWNER_EMAIL);
            return Boolean(owner) && owner?.role === 'owner';
        },
    },
    {
        name: 'cleanup: disable notablescan + restore standard indexes + stop server',
        tags: ['integration', 'cosmos-sim', 'issue-93', 'cleanup'],
        testFn: async () => {
            const db = await getDb();
            try {
                await setNotablescan(db, false);
            } catch { /* if mongo gone, ignore */ }
            // Recreate the standard indexes so any subsequent test in the
            // same db sees the normal shape. Use createIndex idempotently.
            try {
                await membershipsColl(db).createIndex({ locationId: 1 }, { name: 'location_memberships' });
                await membershipsColl(db).createIndex({ userId: 1 }, { name: 'user_memberships' });
                await invitesColl(db).createIndex({ locationId: 1, email: 1 }, { name: 'invite_loc_email' });
            } catch { /* ok if already exists */ }
            // Wipe the test rows so subsequent runs start clean.
            await locations(db).deleteMany({ _id: LOC });
            await usersColl(db).deleteMany({ email: OWNER_EMAIL });
            await membershipsColl(db).deleteMany({ locationId: LOC });
            await invitesColl(db).deleteMany({ locationId: LOC });

            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'cosmos sim — /staff regression (issue #93)');
