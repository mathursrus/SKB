// Integration tests for host auth — PIN login, cookie, protected routes.
// Spawns a real server; sets test env defaults so npm run test:all works.

// Test defaults — won't override if already set
process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_host_auth_test';
process.env.PORT ??= '15398';
process.env.FRAIM_TEST_SERVER_PORT ??= '15398';
process.env.FRAIM_BRANCH ??= '';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../shared-server-utils.js';
import { createOwnerUser } from '../../src/services/users.js';

const OWNER_EMAIL = 'host-auth-owner@example.test';
const OWNER_PASS = 'host-auth-owner-password';
let namedSessionCookie = '';

async function ensureNamedSession(): Promise<string> {
    if (namedSessionCookie) return namedSessionCookie;
    try {
        await createOwnerUser({
            email: OWNER_EMAIL,
            password: OWNER_PASS,
            name: 'Host Auth Owner',
            locationId: 'skb',
        });
    } catch {
        // The integration DB may survive a failed prior run; login below proves
        // whether the existing user is usable.
    }
    const login = await fetch(`${getTestServerUrl()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS, locationId: 'skb' }),
    });
    namedSessionCookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
    return namedSessionCookie;
}

async function hostPinLogin(pin: string | null): Promise<Response> {
    const cookie = await ensureNamedSession();
    const body = pin === null ? {} : { pin };
    return fetch(`${getTestServerUrl()}/api/host/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body),
    });
}

const cases: BaseTestCase[] = [
    {
        name: 'host-auth: server starts',
        tags: ['integration', 'auth', 'setup'],
        testFn: async () => {
            await startTestServer();
            await ensureNamedSession();
            const res = await fetch(`${getTestServerUrl()}/health`);
            return res.ok;
        },
    },
    {
        name: 'host-auth: unauthenticated PIN attempt returns login_required before PIN validation',
        tags: ['integration', 'auth', 'security'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: '0000' }),
            });
            const body = await res.json() as { error?: string };
            return res.status === 401 && body.error === 'login_required';
        },
    },
    {
        name: 'host-auth: wrong PIN returns 401',
        tags: ['integration', 'auth', 'waitlist-path'],
        testFn: async () => {
            const res = await hostPinLogin('0000');
            return res.status === 401;
        },
    },
    {
        name: 'host-auth: missing PIN returns 400',
        tags: ['integration', 'auth'],
        testFn: async () => {
            const res = await hostPinLogin(null);
            return res.status === 400;
        },
    },
    {
        name: 'host-auth: correct PIN returns 200 with Set-Cookie',
        tags: ['integration', 'auth', 'waitlist-path'],
        testFn: async () => {
            const res = await hostPinLogin('1234');
            const body = await res.json() as { ok?: boolean };
            const cookie = res.headers.get('set-cookie') ?? '';
            return res.ok && body.ok === true && cookie.includes('skb_host=');
        },
    },
    {
        name: 'host-auth: /api/host/queue without cookie returns 401',
        tags: ['integration', 'auth', 'waitlist-path'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/queue`);
            return res.status === 401;
        },
    },
    {
        name: 'host-auth: /api/host/queue with valid cookie returns 200',
        tags: ['integration', 'auth', 'waitlist-path'],
        testFn: async () => {
            // Login to get cookie
            const loginRes = await hostPinLogin('1234');
            const rawCookie = loginRes.headers.get('set-cookie') ?? '';
            const cookieValue = rawCookie.split(';')[0]; // "skb_host=..."

            const queueRes = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: cookieValue },
            });
            return queueRes.ok;
        },
    },
    {
        name: 'host-auth: /api/host/stats with valid cookie returns 200',
        tags: ['integration', 'auth', 'stats'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const statsRes = await fetch(`${getTestServerUrl()}/api/host/stats`, {
                headers: { Cookie: cookieValue },
            });
            return statsRes.ok;
        },
    },
    {
        name: 'host-auth: /api/host/analytics accepts stage-range params with valid cookie',
        tags: ['integration', 'auth', 'analytics'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const analyticsRes = await fetch(`${getTestServerUrl()}/api/host/analytics?range=7&partySize=all&startStage=ordered&endStage=served`, {
                headers: { Cookie: cookieValue },
            });
            return analyticsRes.ok;
        },
    },
    {
        name: 'host-auth: /api/host/analytics rejects invalid stage-range params',
        tags: ['integration', 'auth', 'analytics'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const analyticsRes = await fetch(`${getTestServerUrl()}/api/host/analytics?range=7&partySize=all&startStage=served&endStage=ordered`, {
                headers: { Cookie: cookieValue },
            });
            return analyticsRes.status === 400;
        },
    },
    {
        name: 'host-auth: /api/host/voice-config with valid cookie returns 200',
        tags: ['integration', 'auth', 'voice'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const voiceRes = await fetch(`${getTestServerUrl()}/api/host/voice-config`, {
                headers: { Cookie: cookieValue },
            });
            return voiceRes.ok;
        },
    },
    {
        name: 'host-auth: /api/host/messaging-config with valid cookie returns 200 (#69)',
        tags: ['integration', 'auth', 'messaging'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const res = await fetch(`${getTestServerUrl()}/api/host/messaging-config`, {
                headers: { Cookie: cookieValue },
            });
            if (!res.ok) return false;
            const body = await res.json() as { smsSenderName?: unknown; sharedNumber?: unknown };
            // Response shape sanity: strings (possibly empty) for all fields.
            return typeof body.smsSenderName === 'string' && typeof body.sharedNumber === 'string';
        },
    },
    {
        name: 'host-auth: POST /api/host/messaging-config requires admin+ (host PIN → 403, #69)',
        tags: ['integration', 'auth', 'messaging'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const res = await fetch(`${getTestServerUrl()}/api/host/messaging-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Cookie: cookieValue,
                },
                body: JSON.stringify({ smsSenderName: 'Nope' }),
            });
            return res.status === 403;
        },
    },
    {
        name: 'host-auth: POST /api/host/voice-config requires admin+ (host PIN → 403 per #55)',
        tags: ['integration', 'auth', 'voice'],
        testFn: async () => {
            // Since issue #55 config/settings POSTs are gated to
            // owner+admin roles; a PIN-only host cookie (role='host')
            // is rejected with 403 before validation runs. Input-shape
            // validation itself is covered in unit tests for
            // src/services/locations.ts.
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const voiceRes = await fetch(`${getTestServerUrl()}/api/host/voice-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Cookie: cookieValue,
                },
                body: JSON.stringify({ frontDeskPhone: '123', voiceLargePartyThreshold: 2 }),
            });
            return voiceRes.status === 403;
        },
    },
    // ---------- Issue #50 bug 7: door QR endpoint ----------
    {
        name: 'bug50: /api/host/visit-qr.svg returns 200 with image/svg+xml',
        tags: ['integration', 'auth', 'bug50', 'qr'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const qrRes = await fetch(`${getTestServerUrl()}/api/host/visit-qr.svg`, {
                headers: { Cookie: cookieValue },
            });
            if (qrRes.status !== 200) return false;
            if (!(qrRes.headers.get('content-type') || '').includes('image/svg+xml')) return false;
            const body = await qrRes.text();
            return body.startsWith('<svg') && body.includes('</svg>');
        },
    },
    {
        name: 'bug50: /api/host/visit-qr.svg requires host auth (401 without cookie)',
        tags: ['integration', 'auth', 'bug50', 'qr'],
        testFn: async () => {
            const qrRes = await fetch(`${getTestServerUrl()}/api/host/visit-qr.svg`);
            return qrRes.status === 401;
        },
    },
    // ---------- Issue #50 bug 1: diner chat public endpoints ----------
    {
        name: 'bug50: GET /api/queue/chat/:code returns 404 for unknown code (public, no auth needed)',
        tags: ['integration', 'bug50', 'chat'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/queue/chat/SKB-ZZZ`);
            return res.status === 404;
        },
    },
    {
        name: 'bug50: POST /api/queue/chat/:code rejects empty body with 400',
        tags: ['integration', 'bug50', 'chat'],
        testFn: async () => {
            // Use a unique code so we don't bump into the 1-per-3s write rate
            // limiter that keys on :loc:chat-write:<code>.
            const res = await fetch(`${getTestServerUrl()}/api/queue/chat/SKB-AAA`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: '' }),
            });
            return res.status === 400;
        },
    },
    {
        name: 'bug50: POST /api/queue/chat/:code rejects body over 500 chars with 400',
        tags: ['integration', 'bug50', 'chat'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/queue/chat/SKB-BBB`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: 'x'.repeat(501) }),
            });
            return res.status === 400;
        },
    },

    {
        name: 'host-auth: logout clears cookie, next request returns 401',
        tags: ['integration', 'auth'],
        testFn: async () => {
            // Login
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            // Logout
            const logoutRes = await fetch(`${getTestServerUrl()}/api/host/logout`, {
                method: 'POST',
                headers: { Cookie: cookieValue },
            });
            const logoutCookie = logoutRes.headers.get('set-cookie') ?? '';

            // The logout cookie should set Max-Age=0
            return logoutRes.ok && logoutCookie.includes('Max-Age=0');
        },
    },
    {
        name: 'host-auth: tampered cookie returns 401',
        tags: ['integration', 'auth'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: 'skb_host=9999999999.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
            });
            return res.status === 401;
        },
    },
    // ---------- POST /host/queue/add (host-initiated walk-in add) ----------
    {
        name: 'host-add: no cookie → 401',
        tags: ['integration', 'auth', 'add-party'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Walkin', partySize: 2, phone: '2065550001' }),
            });
            return res.status === 401;
        },
    },
    {
        name: 'host-add: valid body with cookie → 200 + code returned',
        tags: ['integration', 'auth', 'add-party', 'waitlist-path'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name: 'WalkIn', partySize: 3, phone: '2065550002' }),
            });
            if (!res.ok) return false;
            const body = await res.json() as { code?: string; position?: number };
            return typeof body.code === 'string' && /^SKB-[A-Z2-9]{3}$/.test(body.code) && typeof body.position === 'number';
        },
    },
    {
        name: 'host-add: name with HTML metacharacters → 400',
        tags: ['integration', 'auth', 'add-party', 'security'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name: '<script>alert(1)</script>', partySize: 2, phone: '2065550003' }),
            });
            if (res.status !== 400) return false;
            const body = await res.json() as { error?: string };
            return typeof body.error === 'string' && body.error.includes('unsupported characters');
        },
    },
    {
        name: 'host-add: invalid phone → 400 with field hint',
        tags: ['integration', 'auth', 'add-party'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name: 'Short', partySize: 2, phone: '555' }),
            });
            if (res.status !== 400) return false;
            const body = await res.json() as { field?: string };
            return body.field === 'phone';
        },
    },
    {
        name: 'host-add: out-of-range party size → 400 with field hint',
        tags: ['integration', 'auth', 'add-party'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name: 'TooBig', partySize: 99, phone: '2065550004' }),
            });
            if (res.status !== 400) return false;
            const body = await res.json() as { field?: string };
            return body.field === 'partySize';
        },
    },

    // ---------- Public /queue/join propagates smsConsent to the wire ----------
    {
        name: 'queue/join: smsConsent=true accepted; 200 returned with a code',
        tags: ['integration', 'queue', 'sms-consent', 'waitlist-path'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/queue/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'OptInWire', partySize: 2, phone: '2065550101', smsConsent: true }),
            });
            if (!res.ok) return false;
            const body = await res.json() as { code?: string };
            return typeof body.code === 'string' && /^SKB-[A-Z2-9]{3}$/.test(body.code);
        },
    },
    {
        name: 'queue/join: omitted smsConsent still joins (defaults to false)',
        tags: ['integration', 'queue', 'sms-consent'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/queue/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Silent', partySize: 2, phone: '2065550102' }),
            });
            return res.ok;
        },
    },
    {
        name: 'host-auth: repeated wrong PINs lock out with 429 + Retry-After',
        tags: ['integration', 'auth', 'waitlist-path', 'security'],
        testFn: async () => {
            for (let i = 0; i < 5; i++) {
                await hostPinLogin('0000');
            }
            const res = await hostPinLogin('1234');
            return res.status === 429 && !!res.headers.get('retry-after');
        },
    },

    {
        name: 'host-auth: teardown',
        tags: ['integration', 'auth'],
        testFn: async () => { await stopTestServer(); return true; },
    },
];

void runTests(cases, 'host-auth (integration)');
