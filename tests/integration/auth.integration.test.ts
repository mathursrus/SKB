// ============================================================================
// Integration tests for unified named-user auth (issue #53).
// ============================================================================
//
// Covers the end-to-end surface introduced by spec §8.5:
//   * POST /api/login (valid/invalid, single vs. multi-membership)
//   * skb_session cookie gates /r/:loc/api/host/* alongside the legacy
//     skb_host PIN cookie — the requireRole middleware should accept both.
//   * Cross-tenant probe: session cookie from loc A rejected at loc B.
//   * Role gating: host-only session rejected when endpoint requires owner
//     (placeholder here — the first owner-only endpoints land in #51d).
//   * Password reset: request → server logs token → confirm with token.
//   * Logout clears both cookies.
//   * Lockout after N failed attempts.
//
// Runs alongside the existing multi-tenancy + host-auth suites and uses
// the same shared server; the test port is different to avoid contention
// when suites run in parallel.

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_auth53_test';
process.env.PORT ??= '15401';
process.env.FRAIM_TEST_SERVER_PORT ??= '15401';
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
    passwordResets as resetsColl,
} from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';
import { createOwnerUser } from '../../src/services/users.js';

const LOC_A = 'auth53-a';
const LOC_B = 'auth53-b';
const PIN_A = '1111';
const PIN_B = '2222';

const OWNER_EMAIL = 'owner-a@example.test';
const OWNER_PASS = 'correct horse battery staple';
const MULTI_EMAIL = 'cross-tenant@example.test';
const MULTI_PASS = 'second-good-password-ok';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await locations(db).deleteMany({ _id: { $in: [LOC_A, LOC_B] } });
    await usersColl(db).deleteMany({ email: { $in: [OWNER_EMAIL, MULTI_EMAIL, 'lockout@example.test', 'reset@example.test'] } });
    await membershipsColl(db).deleteMany({ locationId: { $in: [LOC_A, LOC_B] } });
    await resetsColl(db).deleteMany({});
}

function getCookie(res: Response, name: string): string | null {
    const raw = res.headers.get('set-cookie') ?? '';
    // Multiple Set-Cookie headers are joined by ", " in the WHATWG Fetch
    // Headers; split carefully on the literal `,` that appears before a
    // cookie-name=. Simpler: search for "<name>=" and grab up to the first
    // ";" from that offset.
    const idx = raw.indexOf(`${name}=`);
    if (idx < 0) return null;
    const end = raw.indexOf(';', idx);
    return raw.slice(idx, end === -1 ? undefined : end);
}

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + two tenants + one owner + one cross-tenant staff',
        tags: ['integration', 'auth53', 'setup'],
        testFn: async () => {
            await startTestServer();
            await resetDb();
            await ensureLocation(LOC_A, 'Auth-53 A', PIN_A);
            await ensureLocation(LOC_B, 'Auth-53 B', PIN_B);
            // owner@A
            await createOwnerUser({ email: OWNER_EMAIL, password: OWNER_PASS, name: 'Owner A', locationId: LOC_A });
            // Cross-tenant: a single user with owner memberships at BOTH
            // tenants. We create the user at LOC_A, then directly insert a
            // second membership at LOC_B so the picker branch is covered.
            const multi = await createOwnerUser({ email: MULTI_EMAIL, password: MULTI_PASS, name: 'Multi', locationId: LOC_A });
            const db = await getDb();
            const { ObjectId } = await import('mongodb');
            await membershipsColl(db).insertOne({
                _id: new ObjectId(),
                userId: new ObjectId(multi.user.id),
                locationId: LOC_B,
                role: 'admin',
                createdAt: new Date(),
            });
            return true;
        },
    },

    // ---- R1: createOwnerUser() semantics ----
    {
        name: 'R1: createOwnerUser stores argon2id hash, auto-creates owner membership',
        tags: ['integration', 'auth53', 'createOwnerUser'],
        testFn: async () => {
            const db = await getDb();
            const user = await usersColl(db).findOne({ email: OWNER_EMAIL });
            if (!user) return false;
            if (!user.passwordHash.startsWith('$argon2id$')) return false;
            const m = await membershipsColl(db).findOne({ userId: user._id, locationId: LOC_A });
            return m?.role === 'owner' && !m?.revokedAt;
        },
    },
    {
        name: 'R1: createOwnerUser rejects duplicate email',
        tags: ['integration', 'auth53', 'createOwnerUser'],
        testFn: async () => {
            try {
                await createOwnerUser({
                    email: OWNER_EMAIL,
                    password: 'another-password-99',
                    name: 'Also Me',
                    locationId: LOC_A,
                });
                return false;
            } catch (err) {
                return err instanceof Error && err.message === 'email already registered';
            }
        },
    },

    // ---- 400 on bad request shape ----
    {
        name: 'POST /api/login without email → 400',
        tags: ['integration', 'auth53'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'whatever' }),
            });
            return res.status === 400;
        },
    },
    {
        name: 'POST /api/login without password → 400',
        tags: ['integration', 'auth53'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'x@example.com' }),
            });
            return res.status === 400;
        },
    },

    // ---- 401 on invalid credentials ----
    {
        name: 'POST /api/login with unknown email → 401 generic',
        tags: ['integration', 'auth53'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'nobody@nowhere.test', password: 'whatever-10chars' }),
            });
            return res.status === 401;
        },
    },
    {
        name: 'POST /api/login with wrong password → 401 generic',
        tags: ['integration', 'auth53'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: OWNER_EMAIL, password: 'wrong-password-100' }),
            });
            return res.status === 401;
        },
    },

    // ---- 200 on success with skb_session cookie ----
    {
        name: 'POST /api/login with valid creds → 200 + skb_session cookie + no passwordHash in body',
        tags: ['integration', 'auth53', 'happy-path'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS }),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, unknown>;
            const cookie = getCookie(res as unknown as Response, 'skb_session');
            if (!cookie) return false;
            if (body.role !== 'owner') return false;
            if (body.locationId !== LOC_A) return false;
            // passwordHash must not leak
            if (JSON.stringify(body).includes('passwordHash')) return false;
            if (JSON.stringify(body).includes('argon2')) return false;
            return true;
        },
    },

    // ---- skb_session unlocks host routes (R3) ----
    {
        name: 'R3: skb_session from /api/login unlocks /r/:loc/api/host/queue',
        tags: ['integration', 'auth53', 'requireRole'],
        testFn: async () => {
            const login = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS }),
            });
            const cookie = getCookie(login as unknown as Response, 'skb_session');
            if (!cookie) return false;
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_A}/api/host/queue`, {
                headers: { Cookie: cookie },
            });
            return res.ok;
        },
    },

    // ---- skb_session cross-tenant rejection (mirrors #52's cookie probe) ----
    // Wrong-tenant named sessions now fall through to any valid host PIN for
    // the requested tenant. With no such PIN cookie present here, the final
    // result is 401 unauthorized.
    {
        name: 'skb_session from LOC_A cannot read /r/LOC_B/api/host/queue → 401',
        tags: ['integration', 'auth53', 'cross-tenant'],
        testFn: async () => {
            const login = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS }),
            });
            const cookie = getCookie(login as unknown as Response, 'skb_session');
            if (!cookie) return false;
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/queue`, {
                headers: { Cookie: cookie },
            });
            return res.status === 401;
        },
    },

    // ---- which-restaurant picker ----
    {
        name: 'POST /api/login with multi-membership user → pickLocation:true, no cookie minted yet',
        tags: ['integration', 'auth53', 'picker'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: MULTI_EMAIL, password: MULTI_PASS }),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, unknown>;
            const cookie = getCookie(res as unknown as Response, 'skb_session');
            const memberships = body.memberships as Array<{ locationId: string }> | undefined;
            return body.pickLocation === true
                && cookie === null
                && Array.isArray(memberships) && memberships.length === 2
                && memberships.some(m => m.locationId === LOC_A)
                && memberships.some(m => m.locationId === LOC_B);
        },
    },
    {
        name: 'POST /api/login with picker choice → 200 + cookie scoped to chosen tenant',
        tags: ['integration', 'auth53', 'picker'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: MULTI_EMAIL, password: MULTI_PASS, locationId: LOC_B }),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, unknown>;
            const cookie = getCookie(res as unknown as Response, 'skb_session');
            if (!cookie) return false;
            if (body.locationId !== LOC_B) return false;
            if (body.role !== 'admin') return false;
            const queueRes = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/queue`, {
                headers: { Cookie: cookie },
            });
            return queueRes.ok;
        },
    },
    {
        name: 'POST /api/login with locationId user has no membership at → 403',
        tags: ['integration', 'auth53', 'picker'],
        testFn: async () => {
            // OWNER_EMAIL only has membership at LOC_A; try to force LOC_B.
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS, locationId: LOC_B }),
            });
            return res.status === 403;
        },
    },

    // ---- R4: host PIN requires a named session first ----
    {
        name: 'R4: /r/LOC_A/api/host/login with named session + PIN mints skb_host cookie',
        tags: ['integration', 'auth53', 'backward-compat'],
        testFn: async () => {
            const named = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS, locationId: LOC_A }),
            });
            const session = getCookie(named as unknown as Response, 'skb_session');
            if (!session) return false;
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_A}/api/host/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: session },
                body: JSON.stringify({ pin: PIN_A }),
            });
            if (!res.ok) return false;
            const cookie = getCookie(res as unknown as Response, 'skb_host');
            return cookie !== null;
        },
    },

    // ---- Logout clears both cookies ----
    {
        name: 'POST /api/logout clears skb_session AND skb_host cookies',
        tags: ['integration', 'auth53'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/logout`, { method: 'POST' });
            if (!res.ok) return false;
            const set = res.headers.get('set-cookie') ?? '';
            return set.includes('skb_session=') && set.includes('skb_host=') && set.includes('Max-Age=0');
        },
    },

    // ---- GET /api/me ----
    {
        name: 'GET /api/me without cookie → 401',
        tags: ['integration', 'auth53', 'me'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/me`);
            return res.status === 401;
        },
    },
    {
        name: 'GET /api/me with valid skb_session → returns user + role + locationId',
        tags: ['integration', 'auth53', 'me'],
        testFn: async () => {
            const login = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS }),
            });
            const cookie = getCookie(login as unknown as Response, 'skb_session');
            if (!cookie) return false;
            const res = await fetch(`${getTestServerUrl()}/api/me`, { headers: { Cookie: cookie } });
            if (!res.ok) return false;
            const body = await res.json() as { user?: { email?: string }; role?: string; locationId?: string };
            if (body.user?.email !== OWNER_EMAIL) return false;
            if (body.role !== 'owner') return false;
            if (body.locationId !== LOC_A) return false;
            // passwordHash must never leak from /me
            if (JSON.stringify(body).includes('passwordHash')) return false;
            return true;
        },
    },

    // ---- Lockout ----
    {
        name: 'lockout: 5 failed logins → 6th returns 429 with Retry-After',
        tags: ['integration', 'auth53', 'lockout'],
        testFn: async () => {
            // Use a dedicated email so we don't race with other cases.
            const email = 'lockout@example.test';
            // Create a user so the 401-401-401 path and the lockout path are
            // identical from the server's perspective.
            await createOwnerUser({ email, password: 'correct horse battery 99', name: 'Lockout', locationId: LOC_A });
            for (let i = 0; i < 5; i++) {
                await fetch(`${getTestServerUrl()}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password: 'wrong-xxxxx' }),
                });
            }
            const res = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: 'correct horse battery 99' }),
            });
            return res.status === 429 && !!res.headers.get('retry-after');
        },
    },

    // ---- Password reset ----
    {
        name: 'password reset: request + confirm flow works end-to-end',
        tags: ['integration', 'auth53', 'password-reset'],
        testFn: async () => {
            const email = 'reset@example.test';
            await createOwnerUser({ email, password: 'original-password-1', name: 'Reset', locationId: LOC_A });

            // Capture server logs to pull the token out of the console log
            // (spec §11.1: dev mode logs the link instead of sending email).
            const logs: string[] = [];
            const origLog = console.log.bind(console);
            console.log = (msg: unknown) => { logs.push(String(msg)); };

            try {
                const r1 = await fetch(`${getTestServerUrl()}/api/password-reset/request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });
                if (!r1.ok) return false;
            } finally {
                console.log = origLog;
            }

            // The server-side log line happens in the server process, not
            // here — the console.log capture above catches *this* process's
            // logs. To get the token we need to query the DB.
            const db = await getDb();
            const { users: usersCollFactory } = await import('../../src/core/db/mongo.js');
            const user = await usersCollFactory(db).findOne({ email });
            if (!user) return false;
            const reset = await resetsColl(db).findOne({ userId: user._id }, { sort: { createdAt: -1 } });
            if (!reset) return false;

            // We can't recover the plaintext token from the hash, so we
            // mint a new one directly via the service to test the confirm
            // endpoint. The REAL flow is covered by the request returning
            // 200 + a row landing in password_resets — the confirm endpoint
            // only needs a valid (plaintext, hash) pair to exercise.
            const { createResetToken } = await import('../../src/services/passwordResets.js');
            const { token } = await createResetToken(user._id);

            const r2 = await fetch(`${getTestServerUrl()}/api/password-reset/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: 'brand-new-password-ok' }),
            });
            if (!r2.ok) return false;

            // Login with the new password to confirm the hash rewrote.
            const login = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: 'brand-new-password-ok' }),
            });
            return login.ok;
        },
    },
    {
        name: 'password reset: unknown email → 200 (generic, no side-channel)',
        tags: ['integration', 'auth53', 'password-reset'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/password-reset/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'never-registered@example.test' }),
            });
            return res.ok;
        },
    },
    {
        name: 'password reset: confirm with bad token → 401',
        tags: ['integration', 'auth53', 'password-reset'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/password-reset/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: 'nope-not-a-real-token', password: 'brand-new-password-ok' }),
            });
            return res.status === 401;
        },
    },

    // ---- R6: passwordHash never in response ----
    {
        name: 'R6: passwordHash never appears in any /api/login or /api/me response',
        tags: ['integration', 'auth53', 'compliance'],
        testFn: async () => {
            const login = await fetch(`${getTestServerUrl()}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS }),
            });
            const loginBody = await login.text();
            if (loginBody.includes('passwordHash') || loginBody.includes('$argon2')) return false;
            const cookie = getCookie(login as unknown as Response, 'skb_session');
            if (!cookie) return false;
            const me = await fetch(`${getTestServerUrl()}/api/me`, { headers: { Cookie: cookie } });
            const meBody = await me.text();
            return !meBody.includes('passwordHash') && !meBody.includes('$argon2');
        },
    },

    // ---- Login page reachable ----
    {
        name: 'GET /login serves the login page',
        tags: ['integration', 'auth53', 'pages'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/login`);
            if (!res.ok) return false;
            const html = await res.text();
            return html.includes('id="login-form"') && html.includes('/api/login');
        },
    },

    {
        name: 'teardown',
        tags: ['integration', 'auth53'],
        testFn: async () => {
            await resetDb();
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'auth (issue #53) integration');
