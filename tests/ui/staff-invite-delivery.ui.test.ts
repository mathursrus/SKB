// ============================================================================
// UI test - owner staff invite delivery messaging
// ============================================================================
//
// Verifies the owner-facing Staff tab reflects actual invite delivery state
// instead of always claiming the recipient will receive an email.
//
// Coverage:
//   1. Seed an owner and open /r/:loc/admin.html with a real browser session.
//   2. For each required viewport (375 / 768 / 1280) in both light and dark:
//      - open the Staff tab
//      - submit an invite while ACS email env vars are unset
//      - assert the status message says delivery is not configured
// ============================================================================

const RUN_ID = Math.random().toString(36).slice(2, 8);
process.env.SKB_COOKIE_SECRET ??= 'staff-invite-ui-secret';
process.env.MONGODB_DB_NAME ??= `skb_staff_invite_ui_${RUN_ID}`;
process.env.PORT ??= String(17200 + Math.floor(Math.random() * 400));
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';
delete process.env.ACS_EMAIL_CONNECTION_STRING;
delete process.env.ACS_EMAIL_SENDER;

import { chromium, type Browser } from 'playwright';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';
import { closeDb, getDb, locations, users as usersColl, memberships as membershipsColl, invites as invitesColl } from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';
import { createOwnerUser } from '../../src/services/users.js';

const BASE = () => getTestServerUrl();
const LOC = `staff-invite-ui-${RUN_ID}`;
const OWNER_EMAIL = `staff-invite-owner-${RUN_ID}@example.test`;
const OWNER_PASS = 'staff-invite-ui-password';

let browser: Browser | null = null;

async function seedOwner(): Promise<void> {
    const db = await getDb();
    await locations(db).deleteMany({ _id: LOC });
    await usersColl(db).deleteMany({ email: OWNER_EMAIL });
    await membershipsColl(db).deleteMany({ locationId: LOC });
    await invitesColl(db).deleteMany({ locationId: LOC });
    await ensureLocation(LOC, 'Staff Invite UI', '1234');
    await createOwnerUser({
        email: OWNER_EMAIL,
        password: OWNER_PASS,
        name: 'Staff Invite Owner',
        locationId: LOC,
    });
}

async function createOwnerCookie(): Promise<string> {
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
    return cookieValue;
}

const VIEWPORTS = [
    { width: 375, height: 900, label: 'mobile' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 900, label: 'desktop' },
] as const;

const THEMES = [
    { label: 'light', dark: false },
    { label: 'dark', dark: true },
] as const;

const cases: BaseTestCase[] = [
    {
        name: 'setup: start server, seed owner, launch chromium',
        tags: ['ui', 'staff-invite', 'setup'],
        testFn: async () => {
            await startTestServer();
            await seedOwner();
            browser = await chromium.launch({ headless: true });
            return true;
        },
    },
    {
        name: 'owner Staff tab shows log-only delivery message across required viewports and themes',
        tags: ['ui', 'staff-invite', 'playwright'],
        testFn: async () => {
            if (!browser) return false;
            const cookieValue = await createOwnerCookie();

            for (const viewport of VIEWPORTS) {
                for (const theme of THEMES) {
                    const context = await browser.newContext({
                        viewport: { width: viewport.width, height: viewport.height },
                    });
                    try {
                        await context.addCookies([{
                            name: 'skb_session',
                            value: cookieValue,
                            domain: 'localhost',
                            path: '/',
                            httpOnly: true,
                            sameSite: 'Lax',
                        }]);
                        const page = await context.newPage();
                        await page.goto(`${BASE()}/r/${LOC}/admin.html`, { waitUntil: 'networkidle', timeout: 15000 });
                        await page.evaluate(() => {
                            const modal = document.querySelector('[role="dialog"]') as HTMLElement | null;
                            if (modal) modal.remove();
                        });
                        await page.waitForSelector('.admin-tab[data-tab="staff"]', { state: 'visible', timeout: 5000 });
                        if (theme.dark) {
                            await page.evaluate(() => {
                                document.documentElement.classList.add('theme-dark');
                                localStorage.setItem('skb:theme', 'dark');
                            });
                        }
                        await page.click('.admin-tab[data-tab="staff"]');
                        await page.evaluate(() => {
                            const panel = document.getElementById('admin-panel-staff');
                            if (panel) panel.style.display = '';
                        });
                        await page.waitForFunction(() => {
                            const panel = document.getElementById('admin-panel-staff');
                            return !!panel && panel.style.display !== 'none';
                        }, { timeout: 5000 });

                        const email = `invite-${viewport.label}-${theme.label}-${RUN_ID}@example.test`;
                        await page.evaluate(({ name, email: inviteEmail }) => {
                            const nameInput = document.getElementById('invite-name') as HTMLInputElement | null;
                            const emailInput = document.getElementById('invite-email') as HTMLInputElement | null;
                            const form = document.getElementById('invite-form') as HTMLFormElement | null;
                            if (!nameInput || !emailInput || !form) {
                                throw new Error('invite form missing');
                            }
                            nameInput.value = name;
                            emailInput.value = inviteEmail;
                            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                        }, { name: `${viewport.label} ${theme.label}`, email });
                        await page.waitForFunction(() => {
                            const el = document.getElementById('invite-status');
                            return !!el && /not configured in this environment/i.test(el.textContent || '');
                        }, { timeout: 5000 });
                        const statusText = (await page.textContent('#invite-status') ?? '').trim();
                        if (!statusText.includes(`Invite created for ${email}`)) return false;
                        if (!statusText.includes('not configured in this environment')) return false;
                    } finally {
                        await context.close();
                    }
                }
            }
            return true;
        },
    },
    {
        name: 'teardown: stop browser + server + close db',
        tags: ['ui', 'staff-invite', 'teardown'],
        testFn: async () => {
            if (browser) await browser.close();
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'staff invite delivery UI');
