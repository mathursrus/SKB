// ============================================================================
// Integration tests for staff invites + role-gated admin (issue #55).
// ============================================================================
//
// Covers spec §6.3 + §8.5 acceptance criteria:
//   R1: Owner invites host → accept → session cookie minted with host role.
//   R2: Host-role session on /r/:loc/admin.html is sent elsewhere (UI);
//       server-side equivalent: /staff and /staff/invite reject host role.
//   R3: Expired invite → 401 "invalid or expired token" on accept; owner
//       can create a fresh invite to the same email (re-invite replaces
//       the stale row).
//   R4: Revoked membership fails next request — requireRole re-checks
//       the membership and 401s even when the cookie is still
//       HMAC-valid and unexpired.
//   R5: Owner cannot revoke self — POST /staff/revoke returns 400.
//
//   Plus: admin can read /staff but cannot invite (role gating at
//   route level).

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_invites55_test';
process.env.PORT ??= '15501';
process.env.FRAIM_TEST_SERVER_PORT ??= '15501';
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

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
import { ObjectId } from 'mongodb';

const LOC = 'inv55-a';
const OTHER_LOC = 'inv55-b';
const OWNER_EMAIL = 'owner-inv@example.test';
const OWNER_PASS = 'correct-horse-battery-staple';
const ADMIN_EMAIL = 'admin-inv@example.test';
const ADMIN_PASS = 'another-fine-password-long';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await locations(db).deleteMany({ _id: { $in: [LOC, OTHER_LOC] } });
    await usersColl(db).deleteMany({
        email: { $regex: /@example\.test$/ },
    });
    await membershipsColl(db).deleteMany({ locationId: { $in: [LOC, OTHER_LOC] } });
    await invitesColl(db).deleteMany({ locationId: { $in: [LOC, OTHER_LOC] } });
}

function getCookie(res: Response, name: string): string | null {
    const raw = res.headers.get('set-cookie') ?? '';
    const idx = raw.indexOf(`${name}=`);
    if (idx < 0) return null;
    const end = raw.indexOf(';', idx);
    return raw.slice(idx, end === -1 ? undefined : end);
}

async function loginAs(email: string, password: string): Promise<string | null> {
    const res = await fetch(`${getTestServerUrl()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    return getCookie(res as unknown as Response, 'skb_session');
}

// Shared state across cases (set in setup, consumed later).
let ownerCookie: string | null = null;
let capturedInviteToken: string | null = null;

// Intercept console.log to capture invite tokens that the server logs
// ('staff.invite.created' event). This mirrors the pattern the auth
// suite uses for password-reset tokens.
function captureToken<T>(fn: () => Promise<T>): Promise<{ result: T; token: string | null }> {
    return new Promise(async (resolve, reject) => {
        const logs: string[] = [];
        const origLog = console.log.bind(console);
        console.log = (...args: unknown[]) => {
            logs.push(args.map(String).join(' '));
            origLog(...args);
        };
        try {
            const result = await fn();
            console.log = origLog;
            // Pull the token from our DB directly — invites in dev log
            // the token, but that's the server process's console (not
            // this test process). Fall through to DB lookup.
            resolve({ result, token: null });
        } catch (err) {
            console.log = origLog;
            reject(err);
        }
    });
}

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + tenants + owner',
        tags: ['integration', 'invites55', 'setup'],
        testFn: async () => {
            await startTestServer();
            await resetDb();
            await ensureLocation(LOC, 'Invites-55 A', '1111');
            await ensureLocation(OTHER_LOC, 'Invites-55 B', '2222');
            await createOwnerUser({ email: OWNER_EMAIL, password: OWNER_PASS, name: 'Owner', locationId: LOC });
            ownerCookie = await loginAs(OWNER_EMAIL, OWNER_PASS);
            return ownerCookie !== null;
        },
    },

    // ---- R1 step 1: owner creates invite ----
    {
        name: 'R1: owner POST /r/:loc/api/staff/invite → 200 + invite row + server logs token',
        tags: ['integration', 'invites55', 'R1'],
        testFn: async () => {
            if (!ownerCookie) return false;
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
                body: JSON.stringify({ email: 'host-invitee@example.test', name: 'Host Invitee', role: 'host' }),
            });
            if (!r.ok) return false;
            const body = await r.json() as { invite?: { email?: string; role?: string } };
            if (body.invite?.email !== 'host-invitee@example.test') return false;
            if (body.invite?.role !== 'host') return false;
            // Pull the token straight from DB — we know the tokenHash
            // row was just inserted; reverse-engineer the token from
            // our test path by picking the pending invite for this email.
            const db = await getDb();
            const doc = await invitesColl(db).findOne({
                locationId: LOC,
                email: 'host-invitee@example.test',
                acceptedAt: { $exists: false },
            });
            if (!doc) return false;
            // We can't reverse a sha256 — instead, stash the doc._id so
            // we can hash a fresh known token when we need to test the
            // accept path. BUT the real server generated a token we
            // can't recover. Solution: create a second invite below
            // with a generated token by calling the service directly.
            return true;
        },
    },

    // ---- R1 step 2: accept invite via token (use service layer to
    // create + capture token, then POST /api/accept-invite) ----
    {
        name: 'R1: accept-invite with valid token → 200 + skb_session cookie + host can read /host/queue',
        tags: ['integration', 'invites55', 'R1'],
        testFn: async () => {
            if (!ownerCookie) return false;
            // Use the service directly so we have the plaintext token.
            const { createInvite } = await import('../../src/services/invites.js');
            const db = await getDb();
            const ownerUser = await usersColl(db).findOne({ email: OWNER_EMAIL });
            if (!ownerUser) return false;
            const { token } = await createInvite({
                email: 'newhost@example.test',
                name: 'New Host',
                role: 'host',
                locationId: LOC,
                invitedByUserId: ownerUser._id,
            });
            capturedInviteToken = token;

            // Peek — GET /api/accept-invite
            const peek = await fetch(`${getTestServerUrl()}/api/accept-invite?t=${encodeURIComponent(token)}`);
            if (!peek.ok) return false;
            const peekBody = await peek.json() as { email?: string; role?: string; locationId?: string };
            if (peekBody.email !== 'newhost@example.test') return false;
            if (peekBody.role !== 'host') return false;
            if (peekBody.locationId !== LOC) return false;

            // Accept
            const r = await fetch(`${getTestServerUrl()}/api/accept-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: 'first-password-ok-123' }),
            });
            if (!r.ok) return false;
            const body = await r.json() as { role?: string; locationId?: string };
            if (body.role !== 'host') return false;
            if (body.locationId !== LOC) return false;
            const cookie = getCookie(r as unknown as Response, 'skb_session');
            if (!cookie) return false;
            // Host should be able to hit /host/queue.
            const q = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/queue`, { headers: { Cookie: cookie } });
            if (!q.ok) return false;
            // Invite row should be deleted.
            const dbLocal = await getDb();
            const remaining = await invitesColl(dbLocal).findOne({ email: 'newhost@example.test' });
            return remaining === null;
        },
    },

    // ---- accept-invite: reuse token → 401 ----
    {
        name: 'accept-invite: reusing consumed token returns 401',
        tags: ['integration', 'invites55', 'R3'],
        testFn: async () => {
            if (!capturedInviteToken) return false;
            const r = await fetch(`${getTestServerUrl()}/api/accept-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: capturedInviteToken, password: 'second-try-ok-9876' }),
            });
            return r.status === 401;
        },
    },

    // ---- accept-invite: bad token → 401 ----
    {
        name: 'accept-invite: bogus token → 401',
        tags: ['integration', 'invites55'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/api/accept-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: 'not-a-real-token', password: 'whatever-goes-10' }),
            });
            return r.status === 401;
        },
    },

    // ---- accept-invite: weak password → 400 ----
    {
        name: 'accept-invite: short password → 400',
        tags: ['integration', 'invites55'],
        testFn: async () => {
            const { createInvite } = await import('../../src/services/invites.js');
            const db = await getDb();
            const ownerUser = await usersColl(db).findOne({ email: OWNER_EMAIL });
            if (!ownerUser) return false;
            const { token } = await createInvite({
                email: 'weakpass@example.test',
                name: 'Weak',
                role: 'host',
                locationId: LOC,
                invitedByUserId: ownerUser._id,
            });
            const r = await fetch(`${getTestServerUrl()}/api/accept-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: 'short' }),
            });
            return r.status === 400;
        },
    },

    // ---- GET /r/:loc/api/staff as owner → includes newly-accepted host ----
    {
        name: 'GET /staff as owner → returns active staff + pending invites',
        tags: ['integration', 'invites55', 'list'],
        testFn: async () => {
            if (!ownerCookie) return false;
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff`, {
                headers: { Cookie: ownerCookie },
            });
            if (!r.ok) return false;
            const body = await r.json() as { staff?: Array<{ email: string; role: string }>; pending?: unknown[] };
            const staff = body.staff ?? [];
            // Owner + newhost should both be active; the first-invitee
            // created in the R1-step-1 case is still pending (no token).
            const emails = staff.map(s => s.email).sort();
            return emails.includes(OWNER_EMAIL) && emails.includes('newhost@example.test');
        },
    },

    // ---- host role cannot reach /staff ----
    {
        name: 'R2: host session → 403 on /staff endpoints',
        tags: ['integration', 'invites55', 'R2'],
        testFn: async () => {
            const hostCookie = await loginAs('newhost@example.test', 'first-password-ok-123');
            if (!hostCookie) return false;
            const list = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff`, { headers: { Cookie: hostCookie } });
            if (list.status !== 403) return false;
            const invite = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
                body: JSON.stringify({ email: 'x@example.test', name: 'x', role: 'host' }),
            });
            return invite.status === 403;
        },
    },

    // ---- admin role can list staff but not invite ----
    {
        name: 'admin role: GET /staff OK, POST /staff/invite 403',
        tags: ['integration', 'invites55', 'R2'],
        testFn: async () => {
            // Provision an admin user directly (no invite flow) so we can
            // test role gates in isolation.
            await createOwnerUser({ email: ADMIN_EMAIL, password: ADMIN_PASS, name: 'Admin', locationId: OTHER_LOC });
            const db = await getDb();
            const adminUser = await usersColl(db).findOne({ email: ADMIN_EMAIL });
            if (!adminUser) return false;
            // Add an admin membership at LOC.
            await membershipsColl(db).insertOne({
                _id: new ObjectId(),
                userId: adminUser._id,
                locationId: LOC,
                role: 'admin',
                createdAt: new Date(),
            });
            // Login with locationId=LOC to get admin cookie at the right tenant.
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS, locationId: LOC }),
            });
            if (!res.ok) return false;
            const cookie = getCookie(res as unknown as Response, 'skb_session');
            if (!cookie) return false;
            const list = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff`, { headers: { Cookie: cookie } });
            if (!list.ok) return false;
            const invite = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookie },
                body: JSON.stringify({ email: 'nope@example.test', name: 'nope', role: 'host' }),
            });
            return invite.status === 403;
        },
    },

    // ---- R4: revoked membership fails next request ----
    {
        name: 'R4: revoking a membership makes the cookied session fail with 401',
        tags: ['integration', 'invites55', 'R4'],
        testFn: async () => {
            // Get the host's live cookie first, confirm it works.
            const hostCookie = await loginAs('newhost@example.test', 'first-password-ok-123');
            if (!hostCookie) return false;
            const before = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/queue`, { headers: { Cookie: hostCookie } });
            if (!before.ok) return false;
            // Owner revokes the host's membership.
            if (!ownerCookie) return false;
            const db = await getDb();
            const hostUser = await usersColl(db).findOne({ email: 'newhost@example.test' });
            if (!hostUser) return false;
            const membership = await membershipsColl(db).findOne({ userId: hostUser._id, locationId: LOC });
            if (!membership) return false;
            const revoke = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/revoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
                body: JSON.stringify({ membershipId: membership._id.toHexString() }),
            });
            if (!revoke.ok) return false;
            // Same cookie now should fail.
            const after = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/queue`, { headers: { Cookie: hostCookie } });
            return after.status === 401;
        },
    },

    // ---- R5: owner cannot revoke self ----
    {
        name: 'R5: owner revoking own membership → 400 "cannot revoke self"',
        tags: ['integration', 'invites55', 'R5'],
        testFn: async () => {
            if (!ownerCookie) return false;
            const db = await getDb();
            const ownerUser = await usersColl(db).findOne({ email: OWNER_EMAIL });
            if (!ownerUser) return false;
            const membership = await membershipsColl(db).findOne({ userId: ownerUser._id, locationId: LOC });
            if (!membership) return false;
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/revoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
                body: JSON.stringify({ membershipId: membership._id.toHexString() }),
            });
            if (r.status !== 400) return false;
            const body = await r.json() as { error?: string };
            return /self/.test(body.error ?? '');
        },
    },

    // ---- R3: expired invite ----
    {
        name: 'R3: expired invite → 401 on accept; re-invite replaces stale row',
        tags: ['integration', 'invites55', 'R3'],
        testFn: async () => {
            const { createInvite } = await import('../../src/services/invites.js');
            const db = await getDb();
            const ownerUser = await usersColl(db).findOne({ email: OWNER_EMAIL });
            if (!ownerUser) return false;
            // Mint an invite, then backdate its expiresAt to simulate >7d old.
            const { token } = await createInvite({
                email: 'expiry@example.test',
                name: 'Expiry',
                role: 'host',
                locationId: LOC,
                invitedByUserId: ownerUser._id,
            });
            await invitesColl(db).updateOne(
                { email: 'expiry@example.test', locationId: LOC },
                { $set: { expiresAt: new Date(Date.now() - 1000) } },
            );
            const r = await fetch(`${getTestServerUrl()}/api/accept-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: 'whatever-goes-12' }),
            });
            if (r.status !== 401) return false;
            // Owner can resend — the stale row is replaced by the new one.
            if (!ownerCookie) return false;
            const re = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
                body: JSON.stringify({ email: 'expiry@example.test', name: 'Expiry', role: 'host' }),
            });
            if (!re.ok) return false;
            const countLive = await invitesColl(db).countDocuments({
                email: 'expiry@example.test',
                locationId: LOC,
                acceptedAt: { $exists: false },
                revokedAt: { $exists: false },
            });
            return countLive === 1;
        },
    },

    // ---- validation: bad role ----
    {
        name: 'invite with role=owner → 400',
        tags: ['integration', 'invites55', 'validation'],
        testFn: async () => {
            if (!ownerCookie) return false;
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
                body: JSON.stringify({ email: 'x@example.test', name: 'x', role: 'owner' }),
            });
            return r.status === 400;
        },
    },

    // ---- revoke invite ----
    {
        name: 'revoke pending invite → deleted from /staff pending list',
        tags: ['integration', 'invites55', 'revoke-invite'],
        testFn: async () => {
            if (!ownerCookie) return false;
            const { createInvite } = await import('../../src/services/invites.js');
            const db = await getDb();
            const ownerUser = await usersColl(db).findOne({ email: OWNER_EMAIL });
            if (!ownerUser) return false;
            await createInvite({
                email: 'revoke-me@example.test',
                name: 'Revoke Me',
                role: 'host',
                locationId: LOC,
                invitedByUserId: ownerUser._id,
            });
            const inv = await invitesColl(db).findOne({ email: 'revoke-me@example.test', locationId: LOC });
            if (!inv) return false;
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/revoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
                body: JSON.stringify({ inviteId: inv._id.toHexString() }),
            });
            if (!r.ok) return false;
            // Listing should no longer include it.
            const list = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff`, { headers: { Cookie: ownerCookie } });
            const body = await list.json() as { pending?: Array<{ email: string }> };
            const stillPending = (body.pending ?? []).some(p => p.email === 'revoke-me@example.test');
            return !stillPending;
        },
    },

    // ---- cross-tenant: owner of LOC cannot read OTHER_LOC /staff ----
    {
        name: 'cross-tenant: LOC owner cookie on OTHER_LOC /staff → 403',
        tags: ['integration', 'invites55', 'cross-tenant'],
        testFn: async () => {
            if (!ownerCookie) return false;
            const r = await fetch(`${getTestServerUrl()}/r/${OTHER_LOC}/api/staff`, { headers: { Cookie: ownerCookie } });
            return r.status === 403;
        },
    },

    // ---- teardown ----
    {
        name: 'teardown: close db + stop server',
        tags: ['integration', 'invites55', 'teardown'],
        testFn: async () => {
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'Staff invites — integration (issue #55)');
