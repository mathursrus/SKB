// ============================================================================
// Integration test: full restaurant operator onboarding (issue #69 review).
// ============================================================================
// Walks a new owner from signup through every admin-config surface a real
// restaurant touches before going live:
//
//   1. POST /api/signup                — create owner + location + session
//   2. POST /r/:loc/api/host/site-config     — address + weekly hours
//   3. POST /r/:loc/api/host/voice-config    — IVR enabled + front-desk phone
//   4. POST /r/:loc/api/host/messaging-config — SMS sender display name (#69)
//   5. POST /r/:loc/api/host/guest-features   — toggle SMS/chat/order on the diner flow
//   6. GET  /r/:loc/queue.html                — queue page renders with updated brand
//   7. POST /r/:loc/api/queue/join            — diner joins (smsConsent true)
//   8. POST /r/:loc/api/host/queue/:id/call   — host triggers first-call (SMS leg logs not_configured)
//   9. POST /api/sms/inbound                  — diner reply routes via phone (no URL tenant)
//  10. POST /api/sms/inbound STOP             — opt-out ledger populated
//  11. GET  /r/:loc/api/host/messaging-config — persisted value round-trips
//
// External dependencies (Twilio) are mocked by:
//   - Leaving TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER
//     unset so `getConfig()` returns null and `sendSms` short-circuits to
//     status=not_configured. The outbound call still reaches the chokepoint
//     with the resolved locationId, so the prefix + opt-out paths are
//     exercised.
//   - Setting SKB_ALLOW_UNSIGNED_TWILIO=1 so the inbound webhook accepts
//     the simulated POST without a Twilio signature.
//
// This test reuses shared-server-utils for the server lifecycle, the same
// signup + Mongo-collection helpers signup.integration.test.ts uses, and the
// existing services/chat appendInbound + resolveInboundTenant code paths.
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_onboarding_69_test';
const ONBOARDING_IT_PORT = String(16500 + Math.floor(Math.random() * 500));
process.env.PORT ??= ONBOARDING_IT_PORT;
process.env.FRAIM_TEST_SERVER_PORT ??= ONBOARDING_IT_PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '9999';
process.env.SKB_SIGNUP_MAX_PER_WINDOW ??= '200';
process.env.SKB_LOG_EMAIL_BODY = '0';
process.env.SKB_ALLOW_UNSIGNED_TWILIO = '1';
// Install the test-only Twilio fake: sendSms routes through an in-memory
// capture array instead of contacting real Twilio. This lets the outbound
// leg (sender-name prefix + opt-out suppression + from-number) be asserted
// end-to-end without burning a single Twilio credit. See src/services/sms.ts
// `__getCapturedSmsCalls` and src/routes/testHooks.ts for the moving parts.
process.env.SKB_ENABLE_SMS_TEST_HOOK = '1';
// Provide Twilio-shaped-but-fake creds so getConfig() returns non-null and
// sendSms runs the full code path (prefix, opt-out check, client.create).
// No network call is made because the fake factory takes over at client.
process.env.TWILIO_ACCOUNT_SID = 'ACtest00000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'testtoken00000000000000000000000';
process.env.TWILIO_PHONE_NUMBER = '+18445550199'; // shared OSH toll-free (fake)

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    getTestServerUrl,
    stopTestServer,
} from '../shared-server-utils.js';
import {
    closeDb,
    getDb,
    locations,
    users as usersColl,
    memberships as membershipsColl,
    queueEntries,
    queueMessages,
    smsOptOuts,
} from '../../src/core/db/mongo.js';

const BASE = () => getTestServerUrl();

// Scenario fixtures — unique per test run so parallel CI doesn't collide.
const RUN_ID = Math.random().toString(36).slice(2, 8);
const OWNER_EMAIL = `onboard-${RUN_ID}@example.test`;
const RESTAURANT_NAME = `Onboarding ${RUN_ID} Bistro`;
const CITY = 'Seattle';
const EXPECTED_SLUG = `onboarding-${RUN_ID}-bistro`;
const DINER_PHONE = '2065559001';

// Captured as the scenario progresses.
let sessionCookie = '';
let dinerCode = '';
let dinerEntryId = '';

function getCookie(res: Response, name: string): string | null {
    const raw = res.headers.get('set-cookie') ?? '';
    // The 'set-cookie' header from fetch() may coalesce multiple cookies; we
    // only need the first matching name=value pair before the next `;`.
    const re = new RegExp(`${name}=[^;]*`);
    const m = raw.match(re);
    return m ? m[0] : null;
}

function authedHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return { 'Content-Type': 'application/json', Cookie: sessionCookie, ...extra };
}

async function cleanup(): Promise<void> {
    const db = await getDb();
    await usersColl(db).deleteMany({ email: OWNER_EMAIL });
    await membershipsColl(db).deleteMany({ locationId: EXPECTED_SLUG });
    await locations(db).deleteMany({ _id: EXPECTED_SLUG });
    await queueEntries(db).deleteMany({ locationId: EXPECTED_SLUG });
    await queueMessages(db).deleteMany({ locationId: EXPECTED_SLUG });
    await smsOptOuts(db).deleteMany({ phone: DINER_PHONE });
}

const cases: BaseTestCase[] = [
    {
        name: 'setup: start server + clear fixtures',
        tags: ['integration', 'onboarding', 'setup'],
        testFn: async () => {
            await startTestServer();
            await cleanup();
            return true;
        },
    },

    // ---------- 1. Owner signs up ----------
    {
        name: 'step 1: owner signup creates location + returns session cookie',
        tags: ['integration', 'onboarding', 'signup'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/api/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantName: RESTAURANT_NAME,
                    city: CITY,
                    ownerName: 'Onboard Owner',
                    email: OWNER_EMAIL,
                    password: 'correct horse battery staple',
                    tosAccepted: true,
                }),
            });
            if (res.status !== 201) return false;
            const body = await res.json() as Record<string, any>;
            if (body.location?.id !== EXPECTED_SLUG) return false;
            if (body.membership?.role !== 'owner') return false;
            const cookie = getCookie(res, 'skb_session');
            if (!cookie) return false;
            sessionCookie = cookie;
            return true;
        },
    },

    // ---------- 2. Configure basics ----------
    {
        name: 'step 2: owner sets address + hours via site-config',
        tags: ['integration', 'onboarding', 'site-config'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/site-config`, {
                method: 'POST',
                headers: authedHeaders(),
                body: JSON.stringify({
                    address: { street: '14630 NE 20th St', city: 'Bellevue', state: 'WA', zip: '98007' },
                    hours: {
                        mon: 'closed',
                        tue: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:00', close: '21:30' } },
                    },
                }),
            });
            if (!res.ok) return false;
            const db = await getDb();
            const loc = await locations(db).findOne({ _id: EXPECTED_SLUG });
            return loc?.address?.city === 'Bellevue' && loc?.hours?.mon === 'closed';
        },
    },

    // ---------- 3. Configure voice / IVR ----------
    {
        name: 'step 3: owner enables voice IVR + sets front-desk phone',
        tags: ['integration', 'onboarding', 'voice'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/voice-config`, {
                method: 'POST',
                headers: authedHeaders(),
                body: JSON.stringify({
                    voiceEnabled: true,
                    frontDeskPhone: '4255550142',
                    voiceLargePartyThreshold: 10,
                }),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, any>;
            return body.voiceEnabled === true
                && body.frontDeskPhone === '4255550142'
                && body.voiceLargePartyThreshold === 10;
        },
    },

    // ---------- 4. Configure SMS sender display name (#69) ----------
    {
        name: 'step 4: owner sets SMS sender display name (#69)',
        tags: ['integration', 'onboarding', 'messaging'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/messaging-config`, {
                method: 'POST',
                headers: authedHeaders(),
                body: JSON.stringify({ smsSenderName: 'Onboard Bistro' }),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, any>;
            return body.smsSenderName === 'Onboard Bistro';
        },
    },
    {
        name: 'step 4b: server rejects emoji sender name with 400 and specific error',
        tags: ['integration', 'onboarding', 'messaging', 'validation'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/messaging-config`, {
                method: 'POST',
                headers: authedHeaders(),
                body: JSON.stringify({ smsSenderName: 'Onboard 🎉' }),
            });
            if (res.status !== 400) return false;
            const body = await res.json() as Record<string, any>;
            return typeof body.error === 'string' && body.error.includes('letters, numbers, spaces');
        },
    },

    // ---------- 5. Toggle guest features ----------
    {
        name: 'step 5: owner enables guest-facing SMS + chat, disables ordering',
        tags: ['integration', 'onboarding', 'guest-features'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/guest-features`, {
                method: 'POST',
                headers: authedHeaders(),
                body: JSON.stringify({ sms: true, chat: true, order: false }),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, any>;
            return body.sms === true && body.chat === true && body.order === false;
        },
    },

    // ---------- 6. Public queue page renders ----------
    {
        name: 'step 6: queue page renders with the restaurant brand',
        tags: ['integration', 'onboarding', 'public'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/queue.html`);
            if (!res.ok) return false;
            const html = await res.text();
            // Updated consent copy (#69) should name OSH as the legal sender;
            // and the restaurant name (brandName) should be interpolated.
            return html.includes('from <strong>OSH</strong>')
                && html.includes(RESTAURANT_NAME);
        },
    },

    // ---------- 7. Diner joins the waitlist ----------
    {
        name: 'step 7: diner joins with SMS consent; queue entry + code returned',
        tags: ['integration', 'onboarding', 'diner-join'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/queue/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Onboard Diner',
                    partySize: 2,
                    phone: DINER_PHONE,
                    smsConsent: true,
                }),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, any>;
            if (typeof body.code !== 'string' || !body.code.length) return false;
            dinerCode = body.code;
            // Grab the entry _id for the host call step.
            const db = await getDb();
            const entry = await queueEntries(db).findOne({ code: dinerCode });
            if (!entry) return false;
            dinerEntryId = String(entry._id);
            return true;
        },
    },

    // ---------- 8. Host triggers first-call: full outbound path with Twilio fake ----------
    {
        name: 'step 8: host call invokes Twilio with prefixed body from shared number',
        tags: ['integration', 'onboarding', 'host-call', 'outbound'],
        testFn: async () => {
            // Clear any capture noise from prior test suites running in the same server.
            await fetch(`${BASE()}/__test__/sms-captured`, { method: 'DELETE' });

            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/queue/${dinerEntryId}/call`, {
                method: 'POST',
                headers: authedHeaders(),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, any>;
            if (body.ok !== true || body.smsStatus !== 'sent') return false;

            const cap = await fetch(`${BASE()}/__test__/sms-captured`).then(r => r.json()) as { calls: any[] };
            if (cap.calls.length !== 1) return false;
            const [c] = cap.calls;
            return c.from === '+18445550199'                       // shared OSH toll-free
                && c.to === `+1${DINER_PHONE}`
                && c.locationId === EXPECTED_SLUG
                && typeof c.body === 'string'
                && c.body.startsWith('Onboard Bistro: ')           // per-tenant display-name prefix
                && c.body.includes(dinerCode)                      // template content survives prefix
                && c.body.includes('Your table is ready');         // firstCallMessage copy survives
        },
    },
    {
        name: 'step 8b: second outbound (host calls again) still prefixed, captures grow',
        tags: ['integration', 'onboarding', 'host-call', 'outbound'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/queue/${dinerEntryId}/call`, {
                method: 'POST',
                headers: authedHeaders(),
            });
            if (!res.ok) return false;
            const cap = await fetch(`${BASE()}/__test__/sms-captured`).then(r => r.json()) as { calls: any[] };
            if (cap.calls.length !== 2) return false;
            // Second call uses repeatCallMessage (callCount=2), not firstCallMessage.
            return cap.calls[1].body.startsWith('Onboard Bistro: ')
                && cap.calls[1].body.includes('2 times');
        },
    },

    // ---------- 9. Inbound reply routes via phone → correct party thread ----------
    {
        name: 'step 9: inbound reply on shared /api/sms/inbound lands in diner\'s thread',
        tags: ['integration', 'onboarding', 'sms-inbound'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/api/sms/inbound`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `From=%2B1${DINER_PHONE}&Body=running+10+late&MessageSid=SM_ONBOARD_001`,
            });
            if (!res.ok) return false;
            const db = await getDb();
            const msg = await queueMessages(db).findOne({ twilioSid: 'SM_ONBOARD_001' });
            return msg?.locationId === EXPECTED_SLUG
                && msg?.entryCode === dinerCode
                && msg?.direction === 'inbound';
        },
    },

    // ---------- 10. STOP populates opt-out ledger ----------
    {
        name: 'step 10: STOP reply populates sms_opt_outs ledger',
        tags: ['integration', 'onboarding', 'sms-inbound', 'stop'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/api/sms/inbound`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `From=%2B1${DINER_PHONE}&Body=STOP&MessageSid=SM_ONBOARD_002`,
            });
            if (!res.ok) return false;
            const db = await getDb();
            const opt = await smsOptOuts(db).findOne({ phone: DINER_PHONE });
            return !!opt && opt.phone === DINER_PHONE;
        },
    },
    {
        name: 'step 10b: post-STOP host call is suppressed; Twilio capture array does not grow',
        tags: ['integration', 'onboarding', 'outbound', 'opt-out'],
        testFn: async () => {
            const capBefore = await fetch(`${BASE()}/__test__/sms-captured`).then(r => r.json()) as { calls: any[] };
            const beforeCount = capBefore.calls.length;

            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/queue/${dinerEntryId}/call`, {
                method: 'POST',
                headers: authedHeaders(),
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, any>;
            if (body.smsStatus !== 'failed') return false; // opt-out surfaces as non-sent smsStatus to the host UI

            const capAfter = await fetch(`${BASE()}/__test__/sms-captured`).then(r => r.json()) as { calls: any[] };
            return capAfter.calls.length === beforeCount; // suppressed — no Twilio create call made
        },
    },

    // ---------- 11. Settings round-trip through GET ----------
    {
        name: 'step 11: GET messaging-config returns the previously saved sender name',
        tags: ['integration', 'onboarding', 'messaging'],
        testFn: async () => {
            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/messaging-config`, {
                headers: { Cookie: sessionCookie },
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, any>;
            return body.smsSenderName === 'Onboard Bistro';
        },
    },

    // ---------- teardown ----------
    {
        name: 'teardown: remove fixtures + close db',
        tags: ['integration', 'onboarding', 'teardown'],
        testFn: async () => {
            await cleanup();
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'Onboarding end-to-end (#69)');
