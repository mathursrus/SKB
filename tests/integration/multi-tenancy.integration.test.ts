// Cross-tenant authentication probe (Issue #52, spec §11.3).
//
// Proves that a session cookie minted at one tenant's /host/login cannot
// be used to access another tenant's protected endpoints. This is the
// compliance-validation evidence for the spec's §9.1 cross-tenant
// isolation requirement.
//
// Complements tests/integration/multi-tenant.integration.test.ts, which
// covers *data* isolation (service-layer filters). This file covers
// *auth* isolation (cookie-level tenant binding).

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_multitenancy_auth_test';
process.env.PORT ??= '15399';
process.env.FRAIM_TEST_SERVER_PORT ??= '15399';
process.env.FRAIM_BRANCH ??= '';
// The server bootstraps an 'skb' location using SKB_HOST_PIN. We then
// add two more locations with their own PINs so this test never mutates
// the 'skb' tenant's PIN and the host-auth test can run alongside.
process.env.SKB_HOST_PIN ??= '1234';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../shared-server-utils.js';
import { closeDb, getDb, locations, queueEntries, settings } from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';
import { createHmac } from 'node:crypto';

const LOC_A = 'probe-a';
const LOC_B = 'probe-b';
const PIN_A = '1111';
const PIN_B = '2222';

async function resetDb(): Promise<void> {
    const db = await getDb();
    // Only wipe the two probe tenants so a concurrent host-auth test
    // running on a shared DB name isn't affected.
    await queueEntries(db).deleteMany({ locationId: { $in: [LOC_A, LOC_B] } });
    await settings(db).deleteMany({ locationId: { $in: [LOC_A, LOC_B] } });
    await locations(db).deleteMany({ _id: { $in: [LOC_A, LOC_B] } });
}

async function login(loc: string, pin: string): Promise<string> {
    const res = await fetch(`${getTestServerUrl()}/r/${loc}/api/host/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error(`login at ${loc} failed: ${res.status}`);
    return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

/** Mint a legacy <exp>.<mac> cookie with no lid segment. */
function mintLegacyCookie(key: string): string {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const mac = createHmac('sha256', key).update(String(exp)).digest('hex');
    return `skb_host=${exp}.${mac}`;
}

const cases: BaseTestCase[] = [
    {
        name: 'setup: server starts and probe locations exist',
        tags: ['integration', 'multi-tenancy', 'auth', 'setup'],
        testFn: async () => {
            await startTestServer();
            await resetDb();
            await ensureLocation(LOC_A, 'Probe A', PIN_A);
            await ensureLocation(LOC_B, 'Probe B', PIN_B);
            const res = await fetch(`${getTestServerUrl()}/health`);
            return res.ok;
        },
    },

    // ---- R5: new-format cookie contains lid ----
    {
        name: 'login at A: cookie has 3 dot-separated segments and lid matches',
        tags: ['integration', 'multi-tenancy', 'auth', 'waitlist-path'],
        testFn: async () => {
            const cookie = await login(LOC_A, PIN_A);
            // cookie looks like "skb_host=<lid>.<exp>.<mac>"
            const value = cookie.slice('skb_host='.length);
            const parts = value.split('.');
            if (parts.length !== 3) return false;
            const [lid, exp, mac] = parts;
            if (lid !== LOC_A) return false;
            if (!/^\d+$/.test(exp)) return false;
            if (mac.length !== 64) return false;
            return true;
        },
    },
    {
        name: 'login at skb: cookie contains lid=skb (R5)',
        tags: ['integration', 'multi-tenancy', 'auth', 'waitlist-path'],
        testFn: async () => {
            const cookie = await login('skb', process.env.SKB_HOST_PIN ?? '1234');
            const value = cookie.slice('skb_host='.length);
            return value.split('.')[0] === 'skb';
        },
    },

    // ---- R1: cookie from one tenant rejected at another ----
    {
        name: 'R1: cookie from A → GET /r/B/api/host/queue returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/queue`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/stats returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/stats`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/dining returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/dining`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/completed returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/completed`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/analytics returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/analytics?range=7&partySize=all`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/settings returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/settings`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/voice-config returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/voice-config`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/visit-config returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/visit-config`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/site-config returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/site-config`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → POST /r/B/api/host/queue/add returns 403 (write probe)',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant', 'waitlist-path'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieA },
                body: JSON.stringify({ name: 'Probe', partySize: 2, phone: '2065559999' }),
            });
            return res.status === 403;
        },
    },
    {
        name: 'R1: cookie from A → GET /r/B/api/host/visit-qr.svg returns 403',
        tags: ['integration', 'multi-tenancy', 'auth', 'cross-tenant'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/visit-qr.svg`, {
                headers: { Cookie: cookieA },
            });
            return res.status === 403;
        },
    },

    // ---- Positive control: cookie from A works at A ----
    {
        name: 'control: cookie from A → GET /r/A/api/host/queue returns 200',
        tags: ['integration', 'multi-tenancy', 'auth', 'control'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_A}/api/host/queue`, {
                headers: { Cookie: cookieA },
            });
            return res.ok;
        },
    },

    // ---- R2: legacy-format cookie still accepted ----
    {
        name: 'R2: legacy <exp>.<mac> cookie accepted at /r/skb/api/host/queue',
        tags: ['integration', 'multi-tenancy', 'auth', 'legacy'],
        testFn: async () => {
            const legacy = mintLegacyCookie(process.env.SKB_COOKIE_SECRET!);
            const res = await fetch(`${getTestServerUrl()}/r/skb/api/host/queue`, {
                headers: { Cookie: legacy },
            });
            return res.ok;
        },
    },
    {
        name: 'R2: legacy cookie also accepted at a different tenant (has no lid to bind)',
        description: 'Legacy cookie has no tenant binding; during deprecation window it is accepted everywhere with a log. This is the known softening; 2-release window ends when we flip the acceptance off.',
        tags: ['integration', 'multi-tenancy', 'auth', 'legacy'],
        testFn: async () => {
            const legacy = mintLegacyCookie(process.env.SKB_COOKIE_SECRET!);
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_A}/api/host/queue`, {
                headers: { Cookie: legacy },
            });
            return res.ok;
        },
    },

    // ---- Bad-secret legacy cookie still rejected ----
    {
        name: 'legacy cookie signed with wrong key → 401',
        tags: ['integration', 'multi-tenancy', 'auth', 'legacy'],
        testFn: async () => {
            const legacy = mintLegacyCookie('wrong-secret');
            const res = await fetch(`${getTestServerUrl()}/r/skb/api/host/queue`, {
                headers: { Cookie: legacy },
            });
            return res.status === 401;
        },
    },

    // ---- Tampered new-format cookie: flipping lid invalidates MAC ----
    {
        name: 'tampered: swap lid=A for lid=B on a valid A cookie → 401 (MAC covers lid)',
        tags: ['integration', 'multi-tenancy', 'auth', 'tamper'],
        testFn: async () => {
            const cookieA = await login(LOC_A, PIN_A);
            const value = cookieA.slice('skb_host='.length);
            const [, exp, mac] = value.split('.');
            const swapped = `skb_host=${LOC_B}.${exp}.${mac}`;
            const res = await fetch(`${getTestServerUrl()}/r/${LOC_B}/api/host/queue`, {
                headers: { Cookie: swapped },
            });
            return res.status === 401;
        },
    },

    {
        name: 'teardown',
        tags: ['integration', 'multi-tenancy', 'auth'],
        testFn: async () => {
            await resetDb();
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'multi-tenancy auth probe (integration)');
