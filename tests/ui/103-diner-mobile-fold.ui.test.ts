// ============================================================================
// UI test - Issue #103 R1, R11 / Validation Plan §2b: diner above-fold
// ============================================================================
//
// Validates the actual mobile-rendered layout of public/queue.html at the
// 375 x 667 iPhone-SE viewport. This is browser-rendered (Playwright), not
// a static-asset contract — the whole point of issue #103 is that layout
// behavior on a real phone was broken, so the binding test must be a real
// browser at a real phone-sized viewport.
//
//   1. Pre-join (R1, AC-R1): the "Join the line" submit button's bounding
//      rect MUST be within window.innerHeight on a 375 x 667 viewport.
//   2. Post-join (R11, AC-R11): both the position card (#conf-card) AND
//      the first row of the public-list card (#public-list-card) MUST be
//      within window.innerHeight without scrolling.
//
// We don't drive an end-to-end queue.join here (the e2e suite in
// e2e/queue.e2e.test.ts already exercises that path). Instead we toggle
// the post-join DOM state via page.evaluate so this test stays a pure
// layout-fit assertion.
// ============================================================================

const RUN_ID = Math.random().toString(36).slice(2, 8);
process.env.SKB_COOKIE_SECRET ??= 'diner-fold-ui-secret';
process.env.MONGODB_DB_NAME ??= `skb_103_diner_fold_${RUN_ID}`;
process.env.PORT ??= String(13404);
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';

const BASE = () => getTestServerUrl();

// iPhone-SE physical viewport — the most common smallest-supported phone
// for SKB's walk-in diner ICP.
const VIEWPORT_PHONE = { width: 375, height: 667 };

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

async function openQueueAt(viewport: { width: number; height: number }): Promise<Page> {
    if (!browser) browser = await chromium.launch({ headless: true });
    if (context) await context.close();
    context = await browser.newContext({ viewport });
    const p = await context.newPage();
    await p.goto(`${BASE()}/queue.html`, { waitUntil: 'networkidle', timeout: 15000 });
    // queue.js flips .queue-boot -> .queue-ready once initial fetch completes.
    // For our layout-fit assertion we want the post-boot state where the
    // join card is visible. Force-reveal in case fetch is slow on CI.
    await p.evaluate(() => {
        document.body.classList.remove('queue-boot');
        document.body.classList.add('queue-ready');
        const join = document.getElementById('join-card');
        if (join) (join as HTMLElement).style.display = '';
    });
    return p;
}

async function elementBottom(p: Page, sel: string): Promise<number> {
    return await p.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return -1;
        const r = el.getBoundingClientRect();
        return Math.round(r.bottom);
    }, sel);
}

async function elementTop(p: Page, sel: string): Promise<number> {
    return await p.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return -1;
        const r = el.getBoundingClientRect();
        return Math.round(r.top);
    }, sel);
}

async function viewportHeight(p: Page): Promise<number> {
    return await p.evaluate(() => window.innerHeight);
}

const cases: BaseTestCase[] = [
    {
        name: 'setup: server',
        tags: ['ui', 'issue-103', 'setup'],
        testFn: async () => { await startTestServer(); return true; },
    },
    {
        name: 'pre-join "Join the line" submit is in viewport at 375x667 (R1)',
        tags: ['ui', 'issue-103', 'fold', 'pre-join'],
        testFn: async () => {
            page = await openQueueAt(VIEWPORT_PHONE);
            const submitBottom = await elementBottom(page, '#submit-btn');
            const vh = await viewportHeight(page);
            if (submitBottom < 0) {
                throw new Error('#submit-btn was not found in the rendered DOM');
            }
            if (submitBottom > vh) {
                throw new Error(`#submit-btn bottom=${submitBottom}px > viewport=${vh}px (R1 violated — diner has to scroll to join)`);
            }
            return true;
        },
    },
    {
        name: 'pre-join header + status strip stay above the form (R1)',
        tags: ['ui', 'issue-103', 'fold', 'pre-join'],
        testFn: async () => {
            // Sanity-check: the form must come AFTER the status strip in
            // page flow (ie. status compaction didn't accidentally push it
            // below the form). This guards against an over-eager refactor.
            if (!page) throw new Error('page not initialized');
            const statusBottom = await elementBottom(page, '#status-card');
            const formTop = await elementTop(page, '#join-card');
            if (statusBottom < 0 || formTop < 0) {
                throw new Error(`status or form not rendered (status=${statusBottom}, form=${formTop})`);
            }
            return formTop >= statusBottom;
        },
    },
    {
        name: 'post-join position card + first public-list row are in viewport (R11)',
        tags: ['ui', 'issue-103', 'fold', 'post-join'],
        testFn: async () => {
            // We don't run a real queue.join here (e2e covers that). Instead
            // we paint the post-join DOM state by toggling visibility, then
            // measure layout. Layout-fit is what R11 is asserting.
            page = await openQueueAt(VIEWPORT_PHONE);
            await page.evaluate(() => {
                const join = document.getElementById('join-card');
                if (join) (join as HTMLElement).style.display = 'none';
                const conf = document.getElementById('conf-card');
                if (conf) {
                    (conf as HTMLElement).style.display = '';
                    const pos = document.getElementById('conf-pos');
                    if (pos) pos.textContent = '7';
                    const code = document.getElementById('conf-code');
                    if (code) code.textContent = 'SKB-A4Q';
                    const eta = document.getElementById('conf-eta');
                    if (eta) eta.textContent = '7:48 PM';
                }
                const list = document.getElementById('public-list-card');
                if (list) {
                    (list as HTMLElement).style.display = '';
                    const rows = document.getElementById('public-list-rows');
                    if (rows) {
                        rows.innerHTML = [1,2,3,4,5,6,7,8,9].map(n =>
                            `<div role="listitem" style="padding:6px 8px;background:#fafafa;border:1px solid #f3f3f3;border-radius:6px;font-size:13px;margin-bottom:4px"><span style="color:#e3bf3d;font-weight:700;margin-right:8px">${n}</span><span>Diner ${n}</span></div>`
                        ).join('');
                    }
                    const cnt = document.getElementById('public-list-count');
                    if (cnt) cnt.textContent = '9 parties';
                }
            });

            const confBottom = await elementBottom(page, '#conf-card');
            const firstRowBottom = await elementBottom(page, '#public-list-rows > [role="listitem"]:first-child');
            const vh = await viewportHeight(page);
            if (confBottom < 0) throw new Error('#conf-card not visible in post-join state');
            if (firstRowBottom < 0) throw new Error('first public-list row not visible in post-join state');
            if (confBottom > vh) {
                throw new Error(`#conf-card bottom=${confBottom}px > viewport=${vh}px (R11 violated)`);
            }
            if (firstRowBottom > vh) {
                throw new Error(`first public-list row bottom=${firstRowBottom}px > viewport=${vh}px (R11 violated — public list pushed below fold)`);
            }
            return true;
        },
    },
    {
        name: 'no horizontal overflow at 375px (R9)',
        tags: ['ui', 'issue-103', 'fold', 'overflow'],
        testFn: async () => {
            if (!page) throw new Error('page not initialized');
            const overflow = await page.evaluate(() => {
                return {
                    docW: document.documentElement.scrollWidth,
                    winW: window.innerWidth,
                };
            });
            if (overflow.docW > overflow.winW) {
                throw new Error(`horizontal overflow: scrollWidth=${overflow.docW} > innerWidth=${overflow.winW} (R9 violated)`);
            }
            return true;
        },
    },
    {
        name: 'teardown',
        tags: ['ui', 'issue-103', 'teardown'],
        testFn: async () => {
            if (page) await page.close();
            if (context) await context.close();
            if (browser) await browser.close();
            await stopTestServer();
            return true;
        },
    },
];

runTests(cases, 'issue #103 diner above-fold layout (Playwright)');
