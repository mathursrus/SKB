// ============================================================================
// UI-driven integration test for the full onboarding flow (issue #69 review).
// ============================================================================
// Companion to tests/integration/onboarding-end-to-end.integration.test.ts.
// That sibling exercises the API surface. This test drives the SAME flow
// through a real chromium browser via playwright-core — clicking tabs,
// typing into inputs, submitting forms — so the admin UI and join page
// wiring (HTML + JS + CSS) are proven end-to-end, not just the API.
//
// Flow:
//   1. Owner opens /signup, fills the form, submits → lands on admin.
//   2. Dismisses the onboarding wizard modal.
//   3. Clicks the Messaging tab, edits the sender display name, clicks Save.
//      Asserts "Saved ✓" appears and the live preview updated.
//   4. Expands the Sending numbers card, verifies the shared toll-free
//      (from TWILIO_PHONE_NUMBER) renders in the read-only field.
//   5. Separate incognito context: diner navigates to /r/<slug>/queue.html,
//      verifies the consent copy names OSH, fills the join form with SMS
//      consent checked, submits → gets a confirmation code.
//   6. API (test-hook): host triggers a first-call through the admin API
//      for speed; inspects /__test__/sms-captured; asserts the captured
//      Twilio body starts with the owner-edited sender name and is sent
//      from the fake shared toll-free.
//
// External deps are mocked: sendSms routes through the same in-memory
// capture fake that the API integration test uses (installed via env).
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_onboarding_69_ui_test';
const UI_IT_PORT = String(16800 + Math.floor(Math.random() * 200));
process.env.PORT ??= UI_IT_PORT;
process.env.FRAIM_TEST_SERVER_PORT ??= UI_IT_PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '9999';
process.env.SKB_SIGNUP_MAX_PER_WINDOW ??= '200';
process.env.SKB_LOG_EMAIL_BODY = '0';
process.env.SKB_ALLOW_UNSIGNED_TWILIO = '1';
process.env.SKB_ENABLE_SMS_TEST_HOOK = '1';
process.env.TWILIO_ACCOUNT_SID = 'ACtest00000000000000000000000000';
process.env.TWILIO_AUTH_TOKEN = 'testtoken00000000000000000000000';
process.env.TWILIO_PHONE_NUMBER = '+18445550199';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';
import {
    closeDb, getDb, locations,
    users as usersColl, memberships as membershipsColl,
    queueEntries, queueMessages, smsOptOuts,
} from '../../src/core/db/mongo.js';

const BASE = () => getTestServerUrl();

const RUN_ID = Math.random().toString(36).slice(2, 8);
const OWNER_EMAIL = `ui-onboard-${RUN_ID}@example.test`;
const RESTAURANT_NAME = `UI Onboard ${RUN_ID} Bistro`;
const EXPECTED_SLUG = `ui-onboard-${RUN_ID}-bistro`;
const UPDATED_SENDER_NAME = 'UI Onboard Bistro';
const DINER_PHONE = '2065559002';

let browser: Browser | null = null;
let ownerContext: BrowserContext | null = null;
let ownerPage: Page | null = null;
let dinerEntryId = '';

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
        name: 'setup: start server + launch chromium',
        tags: ['ui', 'onboarding', 'setup'],
        testFn: async () => {
            await startTestServer();
            await cleanup();
            // Clear any prior captures so assertions below are precise.
            await fetch(`${BASE()}/__test__/sms-captured`, { method: 'DELETE' });
            browser = await chromium.launch({ headless: true });
            return true;
        },
    },

    // ---------- 1. Owner signs up via the web form ----------
    {
        name: 'step 1 (ui): owner fills /signup form and lands on /admin',
        tags: ['ui', 'onboarding', 'signup'],
        testFn: async () => {
            if (!browser) return false;
            ownerContext = await browser.newContext();
            ownerPage = await ownerContext.newPage();
            await ownerPage.goto(`${BASE()}/signup`);

            // The signup page has known ids per /public/signup.html; fill and submit.
            await ownerPage.fill('#restaurant-name', RESTAURANT_NAME);
            await ownerPage.fill('#city', 'Bellevue');
            await ownerPage.fill('#owner-name', 'UI Onboard Owner');
            await ownerPage.fill('#email', OWNER_EMAIL);
            await ownerPage.fill('#password', 'correct horse battery staple');
            await ownerPage.check('#tos');
            await Promise.all([
                ownerPage.waitForURL(/\/r\/.+\/admin/, { timeout: 10000 }),
                ownerPage.click('#signup-submit'),
            ]);

            return ownerPage.url().includes(`/r/${EXPECTED_SLUG}/admin`);
        },
    },

    // ---------- 2. Dismiss the onboarding wizard ----------
    {
        name: 'step 2 (ui): dismiss the onboarding wizard so the admin chrome is reachable',
        tags: ['ui', 'onboarding', 'wizard'],
        testFn: async () => {
            if (!ownerPage) return false;
            await ownerPage.evaluate(() => {
                const modal = document.querySelector('[role="dialog"]') as HTMLElement | null;
                if (modal) modal.remove();
            });
            // Wait for the admin tab bar to be present.
            await ownerPage.waitForSelector('.admin-tab[data-tab="messaging"]', { state: 'visible', timeout: 5000 });
            return true;
        },
    },

    // ---------- 3. Open Messaging tab, edit sender name, save ----------
    {
        name: 'step 3 (ui): open Messaging tab, change sender name, Save → "Saved ✓"',
        tags: ['ui', 'onboarding', 'messaging'],
        testFn: async () => {
            if (!ownerPage) return false;
            await ownerPage.click('.admin-tab[data-tab="messaging"]');
            // Wait for the panel to flip visible.
            await ownerPage.waitForFunction(() => {
                const p = document.getElementById('admin-panel-messaging');
                return !!p && p.style.display !== 'none';
            }, { timeout: 5000 });

            // Clear default (loaded from server, will be RESTAURANT_NAME by default) and type the new name.
            await ownerPage.fill('#admin-sms-sender-name', '');
            await ownerPage.fill('#admin-sms-sender-name', UPDATED_SENDER_NAME);
            // Live preview should update.
            const p1 = await ownerPage.textContent('#admin-sms-preview-name-1');
            if (p1 !== UPDATED_SENDER_NAME) return false;

            await ownerPage.click('#admin-sms-sender-save');
            await ownerPage.waitForSelector('#admin-sms-sender-status.success', { timeout: 5000 });
            const status = (await ownerPage.textContent('#admin-sms-sender-status') ?? '').trim();
            return status.includes('Saved');
        },
    },

    // ---------- 4. Sending numbers card shows the shared toll-free ----------
    {
        name: 'step 4 (ui): Sending numbers card shows the shared toll-free from env',
        tags: ['ui', 'onboarding', 'messaging', 'sending-numbers'],
        testFn: async () => {
            if (!ownerPage) return false;
            // Expand the second admin-card (Sending numbers) by toggling its <details>.
            await ownerPage.evaluate(() => {
                const cards = document.querySelectorAll<HTMLDetailsElement>('#admin-panel-messaging details.admin-card');
                if (cards[1]) cards[1].open = true;
            });
            const shared = await ownerPage.inputValue('#admin-sms-shared-number');
            // formatUSPhone('+18445550199') → '(844) 555-0199'
            return shared === '(844) 555-0199';
        },
    },

    // ---------- 5. Diner joins via the public queue.html form ----------
    {
        name: 'step 5 (ui): diner joins via queue.html; consent copy names OSH; code returned',
        tags: ['ui', 'onboarding', 'diner-join'],
        testFn: async () => {
            if (!browser) return false;
            const dinerCtx = await browser.newContext();
            const dinerPage = await dinerCtx.newPage();
            await dinerPage.goto(`${BASE()}/r/${EXPECTED_SLUG}/queue.html`);
            // Consent block names OSH.
            const consent = (await dinerPage.textContent('#sms-consent-block') ?? '').replace(/\s+/g, ' ');
            if (!/from\s+OSH\s+about\s+my\s+wait\s+at\s+/i.test(consent)) { await dinerCtx.close(); return false; }

            await dinerPage.fill('#name', 'UI Onboard Diner');
            await dinerPage.fill('#size', '3');
            await dinerPage.fill('#phone', DINER_PHONE);
            await dinerPage.check('#sms-consent');
            await Promise.all([
                dinerPage.waitForSelector('#conf-card:visible', { timeout: 5000 }),
                dinerPage.click('#submit-btn'),
            ]);
            const code = (await dinerPage.textContent('#conf-code') ?? '').trim();
            await dinerCtx.close();

            if (!code || !code.startsWith('UI')) return false;
            // Capture the entry id from Mongo for the host-call step.
            const db = await getDb();
            const entry = await queueEntries(db).findOne({ code });
            if (!entry) return false;
            dinerEntryId = String(entry._id);
            return true;
        },
    },

    // ---------- 6. Host-triggered outbound (API) captured with UI-edited sender name ----------
    {
        name: 'step 6 (api-via-test-hook): host call produces Twilio body prefixed with the UI-edited sender name',
        tags: ['ui', 'onboarding', 'outbound'],
        testFn: async () => {
            // Clear prior captures from step 1 setup (belt-and-braces).
            await fetch(`${BASE()}/__test__/sms-captured`, { method: 'DELETE' });

            // Pull the owner session cookie from the browser and use it for the API call.
            if (!ownerContext) return false;
            const cookies = await ownerContext.cookies();
            const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

            const res = await fetch(`${BASE()}/r/${EXPECTED_SLUG}/api/host/queue/${dinerEntryId}/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
            });
            if (!res.ok) return false;
            const body = await res.json() as Record<string, any>;
            if (body.smsStatus !== 'sent') return false;

            const cap = await fetch(`${BASE()}/__test__/sms-captured`).then(r => r.json()) as { calls: any[] };
            if (cap.calls.length !== 1) return false;
            const [c] = cap.calls;
            return c.from === '+18445550199'
                && c.to === `+1${DINER_PHONE}`
                && c.locationId === EXPECTED_SLUG
                && typeof c.body === 'string'
                && c.body.startsWith(`${UPDATED_SENDER_NAME}: `)
                && c.body.includes('Your table is ready');
        },
    },

    // ---------- teardown ----------
    {
        name: 'teardown: close browser + cleanup + stop server',
        tags: ['ui', 'onboarding', 'teardown'],
        testFn: async () => {
            if (ownerContext) await ownerContext.close();
            if (browser) await browser.close();
            await cleanup();
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'Onboarding UI end-to-end (#69)');
