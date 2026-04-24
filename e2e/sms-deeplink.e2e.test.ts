// ============================================================================
// SKB - E2E: SMS deep link opens the diner status UI
// ============================================================================
// Full-stack browser test:
//   1. start the real server
//   2. join the queue through the public API
//   3. open the same deep-link shape carried in the SMS
//   4. assert the diner status UI renders, not the join form
// ============================================================================

process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_sms_deeplink_e2e_test';
process.env.PORT ??= '15411';
process.env.FRAIM_TEST_SERVER_PORT ??= '15411';
process.env.FRAIM_BRANCH ??= '';

import path from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../tests/shared-server-utils.js';
import { buildQueueStatusUrl } from '../src/core/utils/url.js';
import { getDb, memberships as membershipsColl, users as usersColl } from '../src/core/db/mongo.js';
import { createOwnerUser } from '../src/services/users.js';

const BASE = getTestServerUrl();
const OWNER_EMAIL = 'sms-deeplink-owner@example.test';
const OWNER_PASS = 'sms-deeplink-owner-password';

function assert(condition: boolean, msg: string): void {
    if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function getBrowserExecutablePath(): string {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error('No Chromium-based browser found on this machine for playwright-core');
}

async function post(pathname: string, body: unknown, cookie?: string): Promise<{ status: number; data: Record<string, unknown>; cookie?: string }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(`${BASE}${pathname}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const data = await res.json() as Record<string, unknown>;
    return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

async function get(pathname: string, cookie?: string): Promise<{ status: number; data: Record<string, unknown> }> {
    const headers: Record<string, string> = {};
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(`${BASE}${pathname}`, { headers });
    const data = await res.json() as Record<string, unknown>;
    return { status: res.status, data };
}

async function loginOwner(): Promise<string> {
    const db = await getDb();
    await usersColl(db).deleteMany({ email: OWNER_EMAIL });
    await membershipsColl(db).deleteMany({ locationId: 'skb' });
    await createOwnerUser({ email: OWNER_EMAIL, password: OWNER_PASS, name: 'SMS Deeplink Owner', locationId: 'skb' });
    const res = await post('/api/login', { email: OWNER_EMAIL, password: OWNER_PASS, locationId: 'skb' });
    if (!res.cookie) throw new Error('owner login did not return a cookie');
    return res.cookie;
}

async function main(): Promise<void> {
    console.log('[E2E] sms-deeplink.e2e.test: starting server');
    await startTestServer();

    const browser = await chromium.launch({
        executablePath: getBrowserExecutablePath(),
        headless: true,
    });

    try {
        const ownerCookie = await loginOwner();
        const loginRes = await post('/api/host/login', { pin: '1234' }, ownerCookie);
        assert(!!loginRes.cookie, 'host login did not return a cookie');

        const hostQueue = await get('/api/host/queue', loginRes.cookie);
        const leftover = hostQueue.data.parties as Array<{ id: string }> | undefined;
        if (leftover) {
            for (const party of leftover) {
                await post(`/api/host/queue/${party.id}/remove`, { reason: 'no_show' }, loginRes.cookie);
            }
        }

        const join = await post('/r/skb/api/queue/join', {
            name: 'SMS Test',
            partySize: 2,
            phone: '2065550103',
            smsConsent: true,
        });
        assert(join.status === 200, `join status=${join.status}`);
        const code = String(join.data.code ?? '');
        assert(/^SKB-[A-Z2-9]{3}$/.test(code), `bad join code=${code}`);

        const deeplink = buildQueueStatusUrl(BASE, 'skb', code);
        const page = await browser.newPage();
        await page.goto(deeplink, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.body.classList.contains('queue-ready'));
        await page.waitForTimeout(500);

        const title = await page.title();
        assert(title === 'Shri Krishna Bhavan — Place in Line', `page title=${title}`);

        const statusCardVisible = await page.locator('#conf-card').isVisible();
        const joinCardVisible = await page.locator('#join-card').isVisible();
        const renderedCode = (await page.locator('#conf-code').innerText()).trim();
        const renderedPosition = (await page.locator('#conf-pos').innerText()).trim();
        const youBadgeVisible = await page.locator('.pqr-you').isVisible();

        assert(statusCardVisible, 'confirmation/status card not visible');
        assert(!joinCardVisible, 'join card should be hidden on deep link');
        assert(renderedCode === code, `rendered code=${renderedCode} expected=${code}`);
        assert(renderedPosition.length > 0, 'position text empty');
        assert(youBadgeVisible, 'viewer row badge "(you)" not visible');

        const screenshotPath = path.resolve('docs/evidence/e2e-sms-deeplink.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`[E2E] PASS: SMS deep link ${deeplink} opened the diner status UI`);
    } finally {
        await browser.close();
        await stopTestServer();
    }
}

main().catch((err) => {
    console.error('[E2E] FAIL:', err);
    void stopTestServer();
    process.exit(1);
});
