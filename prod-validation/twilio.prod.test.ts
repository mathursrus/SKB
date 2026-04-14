// ============================================================================
// SKB - Production Validation: Twilio Voice IVR + SMS surface
// ============================================================================
// Verifies that the production deployment has Twilio voice IVR wired up
// correctly: the router is registered (not 404), the signature validation
// middleware is enforcing, and all 7 voice webhook endpoints exist.
//
// These tests do NOT initiate real phone calls or send real SMS — they only
// probe the HTTP surface that Twilio webhooks target.
//
// Run:
//   npx tsx prod-validation/twilio.prod.test.ts
//   PROD_BASE_URL=https://staging.example.com npx tsx prod-validation/twilio.prod.test.ts
// ============================================================================

import { runTests, httpGet, httpPost, BASE_URL, type BaseTestCase } from './prod-test-utils.js';

const LOC = process.env.PROD_LOC || 'skb';

/** Common Twilio webhook payload fields (enough to exercise the routes). */
const TWILIO_BODY = {
    From: '+15551234567',
    To: '+15551234567',
    CallSid: 'CAtest0000000000000000000000000000',
    AccountSid: 'ACtest0000000000000000000000000000',
};

/** Every voice endpoint registered by voiceRouter(). */
const VOICE_ROUTES = [
    'incoming',
    'menu-choice',
    'ask-name',
    'got-name',
    'got-size-prompt',
    'got-size',
    'confirm-phone',
    'confirm-new-phone',
    'join',
];

const cases: BaseTestCase[] = [
    // ── Prerequisite: app is alive ────────────────────────────────────────
    {
        name: 'prod is reachable and healthy',
        tags: ['prod', 'twilio', 'prereq'],
        testFn: async () => {
            const r = await httpGet('/health');
            return r.status === 200 && r.body.includes('"status":"ok"');
        },
    },
    {
        name: 'prod MongoDB is reachable',
        tags: ['prod', 'twilio', 'prereq'],
        testFn: async () => {
            const r = await httpGet('/health/db');
            return r.status === 200 && r.body.includes('"db":"reachable"');
        },
    },

    // ── Voice router is registered (not 404) ──────────────────────────────
    {
        name: 'voice /incoming endpoint is registered (not 404)',
        tags: ['prod', 'twilio', 'voice', 'router'],
        testFn: async () => {
            const r = await httpPost(`/r/${LOC}/api/voice/incoming`, TWILIO_BODY);
            // Without a valid x-twilio-signature header, the middleware returns 403.
            // 404 would mean TWILIO_VOICE_ENABLED is not set in the environment.
            if (r.status === 404) {
                console.error('  ⚠ Voice router not registered — TWILIO_VOICE_ENABLED must be "true" in app settings');
            }
            return r.status === 403;
        },
    },

    // ── Signature validation middleware is active ─────────────────────────
    {
        name: 'voice endpoints reject requests without x-twilio-signature',
        tags: ['prod', 'twilio', 'voice', 'security'],
        testFn: async () => {
            const r = await httpPost(`/r/${LOC}/api/voice/incoming`, TWILIO_BODY);
            return r.status === 403;
        },
    },
    {
        name: 'voice endpoints reject requests with an invalid signature',
        tags: ['prod', 'twilio', 'voice', 'security'],
        testFn: async () => {
            const r = await httpPost(`/r/${LOC}/api/voice/incoming`, TWILIO_BODY, {
                'x-twilio-signature': 'ThisIsNotAValidSignature==',
            });
            return r.status === 403;
        },
    },

    // ── All 7 voice webhook endpoints exist ───────────────────────────────
    ...VOICE_ROUTES.map((route) => ({
        name: `voice /${route} endpoint exists (returns 403 without signature)`,
        tags: ['prod', 'twilio', 'voice', 'router'],
        testFn: async () => {
            const r = await httpPost(`/r/${LOC}/api/voice/${route}`, TWILIO_BODY);
            return r.status === 403;
        },
    })),

    // ── Twilio-specific config surface ────────────────────────────────────
    {
        name: 'queue page renders (Twilio uses queue state in voice greeting)',
        tags: ['prod', 'twilio', 'voice', 'dependency'],
        testFn: async () => {
            // The voice IVR fetches queue state on /voice/incoming. If the
            // queue page doesn't render, voice will also fail.
            const r = await httpGet(`/r/${LOC}/queue.html`);
            return r.status === 200 && r.body.includes('SKB');
        },
    },

    // ── Outbound SMS delivery statusCallback ─────────────────────────────
    // This endpoint is tenant-global (mounted at /api/sms/status, not under
    // /r/:loc) and receives Twilio POSTs every time a message status
    // changes. Without it, carrier rejections (30034 "unregistered 10DLC")
    // disappear silently. We prove it's registered + middleware-protected
    // the same way we do for voice: POST without a signature → 403.
    {
        name: 'sms /api/sms/status endpoint is registered (not 404)',
        tags: ['prod', 'twilio', 'sms', 'router'],
        testFn: async () => {
            const r = await httpPost('/api/sms/status', {
                MessageSid: 'SMprobe0000000000000000000000000000',
                MessageStatus: 'delivered',
                AccountSid: 'ACprobe0000000000000000000000000000',
            });
            if (r.status === 404) {
                console.error('  ⚠ SMS status route not registered — check smsStatusRouter mount in src/mcp-server.ts');
            }
            return r.status === 403;
        },
    },
    {
        name: 'sms /api/sms/status rejects requests without x-twilio-signature',
        tags: ['prod', 'twilio', 'sms', 'security'],
        testFn: async () => {
            const r = await httpPost('/api/sms/status', {
                MessageSid: 'SMprobe0000000000000000000000000000',
                MessageStatus: 'delivered',
            });
            return r.status === 403;
        },
    },
    {
        name: 'sms /api/sms/status rejects requests with an invalid signature',
        tags: ['prod', 'twilio', 'sms', 'security'],
        testFn: async () => {
            const r = await httpPost(
                '/api/sms/status',
                {
                    MessageSid: 'SMprobe0000000000000000000000000000',
                    MessageStatus: 'delivered',
                },
                { 'x-twilio-signature': 'ThisIsNotAValidSignature==' },
            );
            return r.status === 403;
        },
    },
];

console.log(`\nRunning against: ${BASE_URL}\nLocation: ${LOC}\n`);

void runTests(cases, 'Twilio voice/SMS prod surface');
