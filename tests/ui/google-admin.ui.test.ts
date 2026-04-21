// ============================================================================
// UI test — Google Business Profile card in Settings (issue #51 Phase D)
// ============================================================================
//
// Same stdlib-HTTP style as admin-tabs.ui.test.ts. We don't run Playwright;
// we assert the served HTML + the real API contracts the card depends on.
//
// Specifically:
//   (a) admin.html has the Google-card DOM placeholders (card, buttons,
//       status + last-sync fields);
//   (b) /r/:loc/api/google/status returns credsConfigured + connected
//       flags at owner session (pre-connect);
//   (c) when we fixture a token row directly into Mongo, /status flips to
//       connected=true — proving the card will render the connected state;
//   (d) cross-tenant probe: owner of A cannot read B's /status.
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_google_ui_test';
process.env.PORT ??= '13351';
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_LOG_EMAIL_BODY = '0';
process.env.SKB_SIGNUP_MAX_PER_WINDOW ??= '200';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';
import { closeDb, getDb, users as usersColl, googleTokens as googleTokensColl } from '../../src/core/db/mongo.js';

const BASE = () => getTestServerUrl();

function getCookie(res: Response, name: string): string | null {
    const raw = res.headers.get('set-cookie') ?? '';
    const idx = raw.indexOf(`${name}=`);
    if (idx < 0) return null;
    const end = raw.indexOf(';', idx);
    return raw.slice(idx, end === -1 ? undefined : end);
}

let sessionA = '';
let slugA = '';
let emailA = '';
let sessionB = '';
let slugB = '';
let emailB = '';

async function provisionOwner(label: string): Promise<{ session: string; slug: string; email: string }> {
    const suffix = Math.random().toString(36).slice(2, 8);
    // Lowercase label — the users service normalizes emails on write, so a
    // later users.findOne({ email }) would otherwise miss a "google-ui-A-…"
    // address that got stored as "google-ui-a-…".
    const email = `google-ui-${label.toLowerCase()}-${suffix}@example.com`;
    const res = await fetch(`${BASE()}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            restaurantName: `Google UI ${label} ${suffix}`,
            city: 'Bellevue',
            ownerName: `UI Owner ${label}`,
            email,
            password: 'correct horse battery staple',
            tosAccepted: true,
        }),
    });
    if (!res.ok) throw new Error(`signup ${label} failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { location: { id: string } };
    const slug = data.location.id;
    const session = getCookie(res, 'skb_session') || '';
    if (!session) throw new Error('signup did not set session cookie');
    return { session, slug, email };
}

const cases: BaseTestCase[] = [
    {
        name: 'boot: dev server + two signups',
        tags: ['ui', 'google-admin', 'setup'],
        testFn: async () => {
            await startTestServer();
            const a = await provisionOwner('A');
            slugA = a.slug; sessionA = a.session; emailA = a.email;
            const b = await provisionOwner('B');
            slugB = b.slug; sessionB = b.session; emailB = b.email;
            return slugA.length > 0 && slugB.length > 0 && sessionA !== '' && sessionB !== '' && emailA !== emailB;
        },
    },

    // ---- (a) DOM placeholders ----
    {
        name: 'GET /r/:loc/admin.html declares the Google Business Profile card + buttons',
        tags: ['ui', 'google-admin'],
        testFn: async () => {
            const html = await (await fetch(`${BASE()}/r/${slugA}/admin.html`)).text();
            return /id="admin-gbp-card"/.test(html)
                && /id="admin-gbp-connect"/.test(html)
                && /id="admin-gbp-sync"/.test(html)
                && /id="admin-gbp-disconnect"/.test(html)
                && /id="admin-gbp-link"/.test(html)
                && /id="admin-gbp-last-sync"/.test(html)
                && /Google Business Profile/.test(html);
        },
    },
    {
        name: 'admin.js is served and contains the wireGoogleCard + loadGoogleCard functions',
        tags: ['ui', 'google-admin'],
        testFn: async () => {
            const js = await (await fetch(`${BASE()}/r/${slugA}/admin.js`)).text();
            return /function\s+loadGoogleCard/.test(js)
                && /function\s+wireGoogleCard/.test(js)
                && /api\/google\/status/.test(js)
                && /api\/google\/oauth\/start/.test(js);
        },
    },

    // ---- (b) status contract pre-connect ----
    {
        name: 'GET /api/google/status with owner session → connected:false + credsConfigured flag',
        tags: ['ui', 'google-admin', 'status'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slugA}/api/google/status`, { headers: { Cookie: sessionA } });
            if (!r.ok) return false;
            const body = await r.json() as { connected?: boolean; credsConfigured?: boolean };
            return body.connected === false && typeof body.credsConfigured === 'boolean';
        },
    },

    // ---- (c) token-row fixture flips status to connected ----
    {
        name: 'fixturing google_tokens row → /status returns connected:true',
        tags: ['ui', 'google-admin', 'fixture'],
        testFn: async () => {
            const { upsertToken } = await import('../../src/services/googleBusiness.js');
            const db = await getDb();
            const suffix = slugA;
            // Resolve owner A's ObjectId from the exact email we captured at signup.
            const u = await usersColl(db).findOne({ email: emailA });
            if (!u) return false;
            // Ensure no stale token row lingers from an earlier run so that
            // upsertToken's behavior matches a first-time connect.
            await googleTokensColl(db).deleteMany({ locationId: suffix });
            await upsertToken({
                locationId: suffix,
                connectedByUserId: u._id,
                accessToken: 'ui-fixture-acc',
                refreshToken: 'ui-fixture-ref',
                expiresAt: new Date(Date.now() + 3600_000),
                accountId: 'accounts/ui-a',
                locationResourceName: 'accounts/ui-a/locations/single',
            });
            const r = await fetch(`${BASE()}/r/${suffix}/api/google/status`, { headers: { Cookie: sessionA } });
            if (!r.ok) return false;
            const body = await r.json() as { connected?: boolean; locationResourceName?: string; refreshToken?: unknown };
            return body.connected === true
                && body.locationResourceName === 'accounts/ui-a/locations/single'
                && body.refreshToken === undefined;
        },
    },
    {
        name: 'status response bytes do not contain the fixtured refreshToken or accessToken',
        tags: ['ui', 'google-admin', 'security'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slugA}/api/google/status`, { headers: { Cookie: sessionA } });
            const text = await r.text();
            return !text.includes('ui-fixture-ref') && !text.includes('ui-fixture-acc');
        },
    },

    // ---- (d) cross-tenant ----
    {
        name: 'owner B cannot read owner A\'s /google/status (401)',
        tags: ['ui', 'google-admin', 'cross-tenant'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slugA}/api/google/status`, { headers: { Cookie: sessionB } });
            return r.status === 401;
        },
    },
    {
        name: 'owner B cannot disconnect owner A (401, row stays)',
        tags: ['ui', 'google-admin', 'cross-tenant'],
        testFn: async () => {
            // Belt-and-suspenders: re-assert the token row exists before we
            // probe the negative case. If a prior test left things in a
            // weird state, we want a clear signal (this test returning
            // false + the assertion message) rather than a confusing 403
            // chain.
            const db = await getDb();
            const before = await googleTokensColl(db).findOne({ locationId: slugA });
            if (!before) {
                const { upsertToken } = await import('../../src/services/googleBusiness.js');
                const u = await usersColl(db).findOne({ email: emailA });
                if (!u) return false;
                await upsertToken({
                    locationId: slugA,
                    connectedByUserId: u._id,
                    accessToken: 'x',
                    refreshToken: 'x',
                    expiresAt: new Date(Date.now() + 3600_000),
                });
            }
            const r = await fetch(`${BASE()}/r/${slugA}/api/google/disconnect`, {
                method: 'POST', headers: { Cookie: sessionB },
            });
            if (r.status !== 401) return false;
            const still = await googleTokensColl(db).findOne({ locationId: slugA });
            return still !== null;
        },
    },
    {
        name: 'teardown',
        tags: ['ui', 'google-admin', 'teardown'],
        testFn: async () => {
            await stopTestServer();
            await closeDb();
            return true;
        },
    },
];

void runTests(cases, 'google admin card UI (issue #51 Phase D)');
