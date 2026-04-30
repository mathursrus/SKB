// Integration tests for host auth — PIN login, cookie, protected routes.
// Spawns a real server; sets test env defaults so npm run test:all works.

const HOST_AUTH_IT_PORT = '15472';

// Test defaults — won't override if already set
process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_host_auth_test';
process.env.PORT ??= HOST_AUTH_IT_PORT;
process.env.FRAIM_TEST_SERVER_PORT ??= HOST_AUTH_IT_PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_ENABLE_SMS_TEST_HOOK ??= '1';
process.env.TWILIO_ACCOUNT_SID ??= 'ACtest00000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN ??= 'testtoken00000000000000000000000';
process.env.TWILIO_PHONE_NUMBER ??= '+18445550199';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
    getTestServerPort,
    isPortInUse,
} from '../shared-server-utils.js';
import { closeDb } from '../../src/core/db/mongo.js';
import { createOwnerUser } from '../../src/services/users.js';

const OWNER_EMAIL = 'host-auth-owner@example.test';
const OWNER_PASS = 'host-auth-owner-password';
let namedSessionCookie = '';

async function assertFreshServerPort(): Promise<void> {
    const port = getTestServerPort();
    if (await isPortInUse(port)) {
        throw new Error(
            `host-auth integration requires an isolated server, but port ${port} is already in use`,
        );
    }
}

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

async function clearCapturedSms(): Promise<void> {
    await fetch(`${getTestServerUrl()}/__test__/sms-captured`, { method: 'DELETE' });
}

async function getCapturedSms(): Promise<Array<{ to?: string; body?: string; locationId?: string }>> {
    const res = await fetch(`${getTestServerUrl()}/__test__/sms-captured`);
    const body = await res.json() as { calls?: Array<{ to?: string; body?: string; locationId?: string }> };
    return body.calls ?? [];
}

async function waitForCapturedSms(
    predicate: (calls: Array<{ to?: string; body?: string; locationId?: string }>) => boolean,
    timeoutMs: number = 2_000,
): Promise<Array<{ to?: string; body?: string; locationId?: string }>> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const calls = await getCapturedSms();
        if (predicate(calls)) return calls;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return getCapturedSms();
}

const cases: BaseTestCase[] = [
    {
        name: 'host-auth: server starts',
        tags: ['integration', 'auth', 'setup'],
        testFn: async () => {
            await assertFreshServerPort();
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
            if (!voiceRes.ok) return false;
            const body = await voiceRes.json() as {
                voiceEnabled?: unknown;
                frontDeskPhone?: unknown;
                cateringPhone?: unknown;
                voiceLargePartyThreshold?: unknown;
            };
            return typeof body.voiceEnabled === 'boolean'
                && typeof body.frontDeskPhone === 'string'
                && typeof body.cateringPhone === 'string'
                && typeof body.voiceLargePartyThreshold === 'number';
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
        name: 'host-add: default smsConsent sends join confirmation SMS',
        tags: ['integration', 'auth', 'add-party', 'sms', 'waitlist-path'],
        testFn: async () => {
            await clearCapturedSms();
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name: 'SmsWalkIn', partySize: 2, phone: '2065550111' }),
            });
            if (!res.ok) return false;
            const body = await res.json() as { code?: string };
            if (typeof body.code !== 'string') return false;
            const calls = await waitForCapturedSms((captured) => captured.length === 1);
            if (calls.length !== 1) return false;
            return calls[0]?.locationId === 'skb'
                && calls[0]?.to === '+12065550111'
                && typeof calls[0]?.body === 'string'
                && calls[0].body.includes(body.code)
                && calls[0].body.includes('Track your place in line here:');
        },
    },
    {
        name: 'host-add: smsConsent=false skips join confirmation SMS',
        tags: ['integration', 'auth', 'add-party', 'sms'],
        testFn: async () => {
            await clearCapturedSms();
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name: 'SilentWalkIn', partySize: 2, phone: '2065550112', smsConsent: false }),
            });
            if (!res.ok) return false;
            const calls = await waitForCapturedSms((captured) => captured.length === 0, 300);
            return calls.length === 0;
        },
    },
    {
        name: 'host sentiment: host can set and clear a manual sentiment override',
        tags: ['integration', 'auth', 'host-sentiment', 'waitlist-path'],
        testFn: async () => {
            const suffix = Math.random().toString(36).slice(2, 8);
            const name = `Sentiment-${suffix}`;
            const phone = `206555${String(Math.floor(Math.random() * 9000) + 1000)}`;
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const addRes = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name, partySize: 2, phone }),
            });
            if (!addRes.ok) return false;

            const queueRes = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: cookieValue },
            });
            if (!queueRes.ok) return false;
            const queueBody = await queueRes.json() as {
                parties?: Array<{ id: string; name: string; sentiment?: string; sentimentSource?: string }>;
            };
            const party = queueBody.parties?.find((entry) => entry.name === name);
            if (!party?.id) return false;

            const setRes = await fetch(`${getTestServerUrl()}/api/host/queue/${party.id}/sentiment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ sentiment: 'upset' }),
            });
            if (!setRes.ok) return false;

            const afterSetRes = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: cookieValue },
            });
            if (!afterSetRes.ok) return false;
            const afterSetBody = await afterSetRes.json() as {
                parties?: Array<{ id: string; name: string; sentiment?: string; sentimentSource?: string }>;
            };
            const afterSet = afterSetBody.parties?.find((entry) => entry.id === party.id);
            if (afterSet?.sentiment !== 'upset' || afterSet?.sentimentSource !== 'manual') return false;

            const clearRes = await fetch(`${getTestServerUrl()}/api/host/queue/${party.id}/sentiment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ sentiment: null }),
            });
            if (!clearRes.ok) return false;

            const afterClearRes = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: cookieValue },
            });
            if (!afterClearRes.ok) return false;
            const afterClearBody = await afterClearRes.json() as {
                parties?: Array<{ id: string; name: string; sentiment?: string; sentimentSource?: string }>;
            };
            const afterClear = afterClearBody.parties?.find((entry) => entry.id === party.id);
            return afterClear?.sentimentSource === 'automatic'
                && ['happy', 'neutral', 'upset'].includes(String(afterClear?.sentiment ?? ''));
        },
    },
    {
        name: 'host sentiment: invalid override value returns 400 with field hint',
        tags: ['integration', 'auth', 'host-sentiment'],
        testFn: async () => {
            const suffix = Math.random().toString(36).slice(2, 8);
            const name = `SentimentBad-${suffix}`;
            const phone = `206556${String(Math.floor(Math.random() * 9000) + 1000)}`;
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const addRes = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name, partySize: 2, phone }),
            });
            if (!addRes.ok) return false;

            const queueRes = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: cookieValue },
            });
            if (!queueRes.ok) return false;
            const queueBody = await queueRes.json() as { parties?: Array<{ id: string; name: string }> };
            const party = queueBody.parties?.find((entry) => entry.name === name);
            if (!party?.id) return false;

            const res = await fetch(`${getTestServerUrl()}/api/host/queue/${party.id}/sentiment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ sentiment: 'furious' }),
            });
            if (res.status !== 400) return false;
            const body = await res.json() as { field?: string };
            return body.field === 'sentiment';
        },
    },
    {
        name: 'host sentiment: seated party appears in dining and still supports set/clear override',
        tags: ['integration', 'auth', 'host-sentiment', 'dining'],
        testFn: async () => {
            const suffix = Math.random().toString(36).slice(2, 8);
            const name = `SeatedSent-${suffix}`;
            const phone = `206557${String(Math.floor(Math.random() * 9000) + 1000)}`;
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];

            const addRes = await fetch(`${getTestServerUrl()}/api/host/queue/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ name, partySize: 2, phone }),
            });
            if (!addRes.ok) return false;

            const queueRes = await fetch(`${getTestServerUrl()}/api/host/queue`, {
                headers: { Cookie: cookieValue },
            });
            if (!queueRes.ok) return false;
            const queueBody = await queueRes.json() as { parties?: Array<{ id: string; name: string }> };
            const party = queueBody.parties?.find((entry) => entry.name === name);
            if (!party?.id) return false;

            const seatRes = await fetch(`${getTestServerUrl()}/api/host/queue/${party.id}/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ reason: 'seated', tableNumber: 44, override: true }),
            });
            if (!seatRes.ok) return false;

            const setRes = await fetch(`${getTestServerUrl()}/api/host/queue/${party.id}/sentiment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ sentiment: 'neutral' }),
            });
            if (!setRes.ok) return false;

            const diningRes = await fetch(`${getTestServerUrl()}/api/host/dining`, {
                headers: { Cookie: cookieValue },
            });
            if (!diningRes.ok) return false;
            const diningBody = await diningRes.json() as {
                parties?: Array<{ id: string; name: string; sentiment?: string; sentimentSource?: string }>;
            };
            const diningParty = diningBody.parties?.find((entry) => entry.id === party.id);
            if (diningParty?.sentiment !== 'neutral' || diningParty?.sentimentSource !== 'manual') return false;

            const clearRes = await fetch(`${getTestServerUrl()}/api/host/queue/${party.id}/sentiment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ sentiment: null }),
            });
            if (!clearRes.ok) return false;

            const afterClearRes = await fetch(`${getTestServerUrl()}/api/host/dining`, {
                headers: { Cookie: cookieValue },
            });
            if (!afterClearRes.ok) return false;
            const afterClearBody = await afterClearRes.json() as {
                parties?: Array<{ id: string; name: string; sentiment?: string; sentimentSource?: string }>;
            };
            const afterClear = afterClearBody.parties?.find((entry) => entry.id === party.id);
            return afterClear?.sentimentSource === 'automatic'
                && ['happy', 'neutral', 'upset'].includes(String(afterClear?.sentiment ?? ''));
        },
    },
    // ---------- Issue #106 — host ETA edit + co-owner invites ----------
    {
        name: 'issue106: POST /api/host/queue/:id/eta without cookie → 401',
        tags: ['integration', 'auth', 'issue-106', 'eta'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/507f1f77bcf86cd799439011/eta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ etaAt: '2026-04-29T20:00:00Z' }),
            });
            return res.status === 401;
        },
    },
    {
        name: 'issue106: POST /api/host/queue/:id/eta with empty body → 400',
        tags: ['integration', 'auth', 'issue-106', 'eta'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/507f1f77bcf86cd799439011/eta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({}),
            });
            const body = await res.json() as { error?: string; field?: string };
            return res.status === 400 && body.field === 'etaAt';
        },
    },
    {
        name: 'issue106: POST /api/host/queue/:id/eta with non-Date string → 400',
        tags: ['integration', 'auth', 'issue-106', 'eta'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/507f1f77bcf86cd799439011/eta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ etaAt: 'not-a-date' }),
            });
            return res.status === 400;
        },
    },
    {
        name: 'issue106: POST /api/host/queue/:id/eta with valid id but non-existent party → 404',
        tags: ['integration', 'auth', 'issue-106', 'eta'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            // Well-formed ObjectId, no party.
            const res = await fetch(`${getTestServerUrl()}/api/host/queue/507f1f77bcf86cd799439011/eta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ etaAt: '2026-04-29T20:00:00Z' }),
            });
            return res.status === 404;
        },
    },
    {
        name: 'issue106: POST /api/host/settings as host role → 200 (was 403 under requireAdmin)',
        tags: ['integration', 'auth', 'issue-106', 'settings'],
        testFn: async () => {
            const loginRes = await hostPinLogin('1234');
            const cookieValue = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
            const res = await fetch(`${getTestServerUrl()}/api/host/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieValue },
                body: JSON.stringify({ avgTurnTimeMinutes: 9 }),
            });
            const body = await res.json() as { avgTurnTimeMinutes?: number };
            // Issue #106: hosts can now save ETA settings without escalating
            // role. The route returns the post-save settings DTO on success.
            return res.status === 200 && body.avgTurnTimeMinutes === 9;
        },
    },
    {
        name: 'issue106: POST /api/host/settings without cookie → 401',
        tags: ['integration', 'auth', 'issue-106', 'settings'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/api/host/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avgTurnTimeMinutes: 9 }),
            });
            return res.status === 401;
        },
    },

    {
        name: 'host-auth: teardown',
        tags: ['integration', 'auth'],
        testFn: async () => {
            namedSessionCookie = '';
            await stopTestServer();
            await closeDb();
            return true;
        },
    },
];

void runTests(cases, 'host-auth (integration)');
