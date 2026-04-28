// ============================================================================
// UI test - caller journey detail in Admin caller statistics
// ============================================================================
//
// Validates the real Admin caller-stats UI behavior for the row-selection
// enhancement:
//   1. a recent caller row renders for a seeded caller session
//   2. selecting that row switches the detail card to "Caller journey"
//   3. the journey list renders the persisted ordered steps
//   4. the selected-row state remains visible
//   5. phone-width layout avoids horizontal overflow
// ============================================================================

const RUN_ID = Math.random().toString(36).slice(2, 8);
process.env.SKB_COOKIE_SECRET ??= 'caller-journey-ui-secret';
process.env.MONGODB_DB_NAME ??= `skb_caller_journey_ui_test_${RUN_ID}`;
process.env.PORT ??= String(17000 + Math.floor(Math.random() * 400));
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';
import { closeDb, getDb, voiceCallSessions, users as usersColl, memberships as membershipsColl } from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';
import { createOwnerUser } from '../../src/services/users.js';
import { serviceDay } from '../../src/core/utils/time.js';

const BASE = () => getTestServerUrl();
const LOC = `caller-journey-ui-${RUN_ID}`;
const OWNER_EMAIL = `caller-journey-ui-${RUN_ID}@example.test`;
const OWNER_PASS = 'caller-journey-ui-password';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

async function seedCallerJourney(): Promise<void> {
    const db = await getDb();
    await voiceCallSessions(db).deleteMany({ locationId: LOC });
    await usersColl(db).deleteMany({ email: OWNER_EMAIL });
    await membershipsColl(db).deleteMany({ locationId: LOC });
    await ensureLocation(LOC, 'Caller Journey UI', '1234');
    await createOwnerUser({
        email: OWNER_EMAIL,
        password: OWNER_PASS,
        name: 'Caller Journey Owner',
        locationId: LOC,
    });

    // Seed relative to now so the session always falls inside the admin
     // page's default `range=1` (today-only) caller-stats filter.
    const startedAt = new Date(Date.now() - 4 * 60 * 1000);
    const stepAt = (offsetSec: number) => new Date(startedAt.getTime() + offsetSec * 1000);
    await voiceCallSessions(db).insertOne({
        locationId: LOC,
        callSid: 'CA-ui-journey',
        serviceDay: serviceDay(startedAt),
        startedAt,
        lastEventAt: stepAt(240),
        endedAt: stepAt(240),
        callerLast4: '0199',
        firstMenuChoice: 'join_waitlist',
        joinIntent: true,
        nameCaptureMode: 'normal',
        partySize: 2,
        phoneSource: 'caller_id',
        queueCode: 'SKB-123',
        currentStage: 'joined',
        finalOutcome: 'joined_waitlist',
        steps: [
            { at: startedAt, event: 'incoming' },
            { at: stepAt(10), event: 'menu_choice', detail: 'join_waitlist' },
            { at: stepAt(10), event: 'join_intent' },
            { at: stepAt(60), event: 'name_captured', detail: 'normal' },
            { at: stepAt(120), event: 'size_captured', detail: '2' },
            { at: stepAt(180), event: 'phone_source', detail: 'caller_id' },
            { at: stepAt(240), event: 'joined', detail: 'SKB-123' },
        ],
    });
}

async function loginOwnerAndOpenAdmin(): Promise<void> {
    const login = await fetch(`${BASE()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: OWNER_EMAIL,
            password: OWNER_PASS,
            locationId: LOC,
        }),
    });
    const cookieHeader = login.headers.get('set-cookie') ?? '';
    const cookieValue = cookieHeader.split(';')[0]?.split('=')[1] ?? '';
    if (!login.ok || !cookieValue) {
        throw new Error(`owner login failed: ${login.status}`);
    }

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.addCookies([{
        name: 'skb_session',
        value: cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
    }]);
    page = await context.newPage();
    await page.goto(`${BASE()}/r/${LOC}/admin.html`, { waitUntil: 'networkidle', timeout: 15000 });
}

const cases: BaseTestCase[] = [
    {
        name: 'setup: start server, seed caller session, and open admin',
        tags: ['ui', 'caller-journey', 'setup'],
        testFn: async () => {
            await seedCallerJourney();
            await startTestServer();
            await loginOwnerAndOpenAdmin();
            return page !== null;
        },
    },
    {
        name: 'selecting a recent caller row shows the caller journey detail',
        tags: ['ui', 'caller-journey', 'caller-stats'],
        testFn: async () => {
            if (!page) return false;
            await page.waitForFunction(() => document.querySelectorAll('.caller-session-row').length === 1);
            await page.evaluate(() => {
                document.querySelector('.caller-session-row')?.scrollIntoView({ block: 'center' });
                document.querySelector('.caller-session-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
            await page.waitForFunction(() => document.getElementById('admin-caller-detail-type')?.textContent?.includes('Caller journey'));

            const state = await page.evaluate(() => ({
                detailType: document.getElementById('admin-caller-detail-type')?.textContent?.trim(),
                title: document.getElementById('admin-caller-detail-title')?.textContent?.trim(),
                share: document.getElementById('admin-caller-detail-share')?.textContent?.trim(),
                stepCount: document.querySelectorAll('.caller-journey-step').length,
                activeRows: document.querySelectorAll('.caller-session-row.is-active').length,
            }));

            return state.detailType === 'Caller journey'
                && state.title === 'Joined waitlist'
                && state.share === 'Caller **** 0199'
                && state.stepCount === 7
                && state.activeRows === 1;
        },
    },
    {
        name: 'caller journey remains usable at phone width',
        tags: ['ui', 'caller-journey', 'responsive'],
        testFn: async () => {
            if (!page) return false;
            await page.setViewportSize({ width: 390, height: 844 });
            await page.evaluate(() => {
                document.querySelector('.caller-session-row')?.scrollIntoView({ block: 'center' });
            });
            const state = await page.evaluate(() => ({
                detailVisible: !!document.querySelector('.caller-journey-list'),
                activeRows: document.querySelectorAll('.caller-session-row.is-active').length,
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
            }));

            return state.detailVisible
                && state.activeRows === 1
                && state.scrollWidth <= state.clientWidth + 4;
        },
    },
    {
        name: 'teardown: close browser, cleanup db, stop server',
        tags: ['ui', 'caller-journey', 'teardown'],
        testFn: async () => {
            if (context) await context.close();
            if (browser) await browser.close();
            const db = await getDb();
            await voiceCallSessions(db).deleteMany({ locationId: LOC });
            await usersColl(db).deleteMany({ email: OWNER_EMAIL });
            await membershipsColl(db).deleteMany({ locationId: LOC });
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'caller journey UI');
