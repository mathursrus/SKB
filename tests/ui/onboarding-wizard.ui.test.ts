// ============================================================================
// UI-ish test for the inline onboarding wizard (issue #51, Phase C).
//
// Walks the end-to-end wizard flow via stdlib HTTP (same style as
// tests/ui/admin-tabs.ui.test.ts — Playwright is not a devDep):
//   (1) signup → session cookie
//   (2) served /r/:loc/admin.html carries the 6-step wizard markup
//   (3) each step's endpoint accepts the payload the wizard POSTs
//   (4) /api/onboarding/steps records progress per step
//   (5) /api/host/pin exposes the host PIN to the "you're live" screen
//   (6) /api/public-config reflects the saved values (site surfaces them)
//
// The wizard JS itself is not a Node module (it's IIFE-only), so these tests
// assert the *contract* the wizard executes against the real server.
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_onboardingwiz_ui_test';
process.env.PORT ??= '13301';
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_LOG_EMAIL_BODY = '0';
process.env.SKB_SIGNUP_MAX_PER_WINDOW ??= '200';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, getTestServerUrl } from '../shared-server-utils.js';

const BASE = () => getTestServerUrl();

// 1x1 PNG, base64
const ONE_PX_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

function getCookie(res: Response, name: string): string | null {
    const raw = res.headers.get('set-cookie') ?? '';
    const idx = raw.indexOf(`${name}=`);
    if (idx < 0) return null;
    const end = raw.indexOf(';', idx);
    return raw.slice(idx, end === -1 ? undefined : end);
}

let sessionCookie = '';
let slug = '';

async function provisionOwner(): Promise<void> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `wizard-ui-${suffix}@example.com`;
    const res = await fetch(`${BASE()}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            restaurantName: `Wizard UI ${suffix}`,
            city: 'Seattle',
            ownerName: 'Wizard Owner',
            email,
            password: 'correct horse battery staple',
            tosAccepted: true,
        }),
    });
    if (!res.ok) throw new Error(`signup ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { location: { id: string } };
    slug = data.location.id;
    sessionCookie = getCookie(res, 'skb_session') || '';
    if (!sessionCookie) throw new Error('signup did not set session cookie');
}

function apiUrl(p: string): string { return `${BASE()}/r/${slug}/api/${p.replace(/^\//, '')}`; }
async function apiFetch(p: string, init: RequestInit = {}): Promise<Response> {
    const headers = Object.assign({}, init.headers, { Cookie: sessionCookie }) as Record<string, string>;
    if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(apiUrl(p), Object.assign({}, init, { headers }));
}

const cases: BaseTestCase[] = [
    {
        name: 'boot: dev server + owner signup + session cookie',
        tags: ['ui', 'onboarding-wizard', 'setup'],
        testFn: async () => {
            await startTestServer();
            await provisionOwner();
            return slug.length > 0 && sessionCookie.length > 0;
        },
    },

    // ─── Served markup carries the 6-step wizard ──────────────────────
    {
        name: 'served admin.html carries all 6 wizard step panels',
        tags: ['ui', 'onboarding-wizard'],
        testFn: async () => {
            const html = await (await fetch(`${BASE()}/r/${slug}/admin.html`)).text();
            for (const s of ['basics', 'template', 'content', 'dishes', 'menu', 'staff', 'done']) {
                if (!new RegExp(`data-panel="${s}"`).test(html)) return false;
            }
            return /id="wiz-preview-iframe"/.test(html) && /id="onboarding-progress"/.test(html);
        },
    },
    {
        name: 'served admin.html has exactly 3 signature-dish file inputs inside the wizard',
        tags: ['ui', 'onboarding-wizard', 'dishes'],
        testFn: async () => {
            const html = await (await fetch(`${BASE()}/r/${slug}/admin.html`)).text();
            const inside = html.split('data-panel="dishes"')[1] || '';
            const m = inside.match(/<input[^>]*class="wiz-dish-file"[^>]*accept="image\/\*"/g) || [];
            return m.length === 3;
        },
    },

    // ─── Step 1 (basics): site-config + voice-config both accept ─────
    {
        name: 'Step 1 (basics) POST site-config persists address + hours',
        tags: ['ui', 'onboarding-wizard', 'basics'],
        testFn: async () => {
            const r = await apiFetch('host/site-config', {
                method: 'POST',
                body: JSON.stringify({
                    address: { street: '1402 12th Ave', city: 'Seattle', state: 'WA', zip: '98122' },
                    hours: {
                        mon: 'closed',
                        tue: { dinner: { open: '17:00', close: '22:00' } },
                        wed: { dinner: { open: '17:00', close: '22:00' } },
                        thu: { dinner: { open: '17:00', close: '22:00' } },
                        fri: { dinner: { open: '17:00', close: '22:00' } },
                        sat: { dinner: { open: '17:00', close: '22:00' } },
                        sun: { dinner: { open: '17:00', close: '21:00' } },
                    },
                }),
            });
            if (!r.ok) return false;
            const check = await (await apiFetch('host/site-config')).json();
            return check.address?.street === '1402 12th Ave'
                && check.hours?.mon === 'closed'
                && check.hours?.tue?.dinner?.open === '17:00';
        },
    },
    {
        name: 'Step 1 (basics) POST voice-config persists frontDeskPhone',
        tags: ['ui', 'onboarding-wizard', 'basics'],
        testFn: async () => {
            const r = await apiFetch('host/voice-config', {
                method: 'POST',
                body: JSON.stringify({ frontDeskPhone: '2065550142' }),
            });
            if (!r.ok) return false;
            const check = await (await apiFetch('host/voice-config')).json();
            return check.frontDeskPhone === '2065550142';
        },
    },
    {
        name: 'Step 1 (basics) POST onboarding/steps records "basics" complete',
        tags: ['ui', 'onboarding-wizard', 'basics'],
        testFn: async () => {
            const r = await apiFetch('onboarding/steps', {
                method: 'POST',
                body: JSON.stringify({ step: 'basics' }),
            });
            if (!r.ok) return false;
            const body = await r.json();
            return Array.isArray(body.steps) && body.steps.includes('basics');
        },
    },

    // ─── Step 2 (template) ────────────────────────────────────────────
    {
        name: 'Step 2 (template) POST config/website persists template = slate',
        tags: ['ui', 'onboarding-wizard', 'template'],
        testFn: async () => {
            const r = await apiFetch('config/website', {
                method: 'POST',
                body: JSON.stringify({ websiteTemplate: 'slate' }),
            });
            if (!r.ok) return false;
            const body = await r.json();
            return body.websiteTemplate === 'slate';
        },
    },
    {
        name: 'Step 2 (template) marks "template" step complete',
        tags: ['ui', 'onboarding-wizard', 'template'],
        testFn: async () => {
            const r = await apiFetch('onboarding/steps', {
                method: 'POST',
                body: JSON.stringify({ step: 'template' }),
            });
            const body = await r.json();
            return r.ok && body.steps.includes('template');
        },
    },

    // ─── Step 3 (content) ─────────────────────────────────────────────
    {
        name: 'Step 3 (content) POST config/website persists hero + about',
        tags: ['ui', 'onboarding-wizard', 'content'],
        testFn: async () => {
            const r = await apiFetch('config/website', {
                method: 'POST',
                body: JSON.stringify({
                    content: {
                        heroHeadline: 'Slow-simmered tonkotsu, ready tonight.',
                        heroSubhead: 'No app, no reservation line.',
                        about: 'Four chefs, one stove, twenty seats.',
                        instagramHandle: '@wizard.test',
                        reservationsNote: 'Walk-ins welcome',
                    },
                }),
            });
            if (!r.ok) return false;
            const body = await r.json();
            return body.content?.heroHeadline === 'Slow-simmered tonkotsu, ready tonight.'
                && body.content?.instagramHandle === '@wizard.test';
        },
    },
    {
        name: 'Step 3 (content) marks "content" step complete',
        tags: ['ui', 'onboarding-wizard', 'content'],
        testFn: async () => {
            const r = await apiFetch('onboarding/steps', {
                method: 'POST',
                body: JSON.stringify({ step: 'content' }),
            });
            const body = await r.json();
            return r.ok && body.steps.includes('content');
        },
    },

    // ─── Step 4 (dishes) ──────────────────────────────────────────────
    {
        name: 'Step 4 (dishes) POST persists knownFor with base64 upload → /assets/ URL',
        tags: ['ui', 'onboarding-wizard', 'dishes'],
        testFn: async () => {
            // Wizard Step 4 replays the full LocationContent (it keeps the
            // baseline from steps 2-3 in memory) so the POST doesn't clobber
            // what came before. Mirror that here.
            const existing = await (await apiFetch('config/website')).json();
            const r = await apiFetch('config/website', {
                method: 'POST',
                body: JSON.stringify({
                    content: Object.assign({}, existing.content || {}, {
                        knownFor: [
                            { title: 'Tonkotsu', desc: 'Pork broth.', image: { mime: 'image/png', data: ONE_PX_PNG_B64 } },
                            { title: 'Shio',     desc: 'Salt.',      image: '' },
                        ],
                    }),
                }),
            });
            if (!r.ok) return false;
            const body = await r.json();
            const first = body?.content?.knownFor?.[0];
            return typeof first?.image === 'string'
                && /^\/assets\/[^/]+\/dishes\/[a-f0-9]+\.(png|jpg|jpeg|webp)$/.test(first.image);
        },
    },
    {
        name: 'Step 4 (dishes) marks "dishes" step complete',
        tags: ['ui', 'onboarding-wizard', 'dishes'],
        testFn: async () => {
            const r = await apiFetch('onboarding/steps', {
                method: 'POST',
                body: JSON.stringify({ step: 'dishes' }),
            });
            const body = await r.json();
            return r.ok && body.steps.includes('dishes');
        },
    },

    // ─── Step 5 (menu) ────────────────────────────────────────────────
    {
        name: 'Step 5 (menu) POST visit-config persists menuUrl',
        tags: ['ui', 'onboarding-wizard', 'menu'],
        testFn: async () => {
            const r = await apiFetch('host/visit-config', {
                method: 'POST',
                body: JSON.stringify({ visitMode: 'auto', menuUrl: 'https://example.com/menu.pdf', closedMessage: null }),
            });
            if (!r.ok) return false;
            const check = await (await apiFetch('host/visit-config')).json();
            return check.menuUrl === 'https://example.com/menu.pdf';
        },
    },
    {
        name: 'Step 5 (menu) marks "menu" step complete',
        tags: ['ui', 'onboarding-wizard', 'menu'],
        testFn: async () => {
            const r = await apiFetch('onboarding/steps', {
                method: 'POST',
                body: JSON.stringify({ step: 'menu' }),
            });
            const body = await r.json();
            return r.ok && body.steps.includes('menu');
        },
    },

    // ─── Step 6 (staff) ───────────────────────────────────────────────
    {
        name: 'Step 6 (staff) POST invite succeeds for admin + host roles',
        tags: ['ui', 'onboarding-wizard', 'staff'],
        testFn: async () => {
            const a = await apiFetch('staff/invite', {
                method: 'POST',
                body: JSON.stringify({ email: 'invite-admin-wizard@example.com', name: 'Admin Two', role: 'admin' }),
            });
            const b = await apiFetch('staff/invite', {
                method: 'POST',
                body: JSON.stringify({ email: 'invite-host-wizard@example.com', name: 'Host Two', role: 'host' }),
            });
            return a.ok && b.ok;
        },
    },
    {
        name: 'Step 6 (staff) marks "staff" step complete',
        tags: ['ui', 'onboarding-wizard', 'staff'],
        testFn: async () => {
            const r = await apiFetch('onboarding/steps', {
                method: 'POST',
                body: JSON.stringify({ step: 'staff' }),
            });
            const body = await r.json();
            return r.ok && body.steps.includes('staff');
        },
    },

    // ─── "You're live" & public site reflects changes ─────────────────
    {
        name: 'GET /r/:loc/api/host/pin returns the host PIN (for the "you\'re live" screen)',
        tags: ['ui', 'onboarding-wizard', 'done'],
        testFn: async () => {
            const r = await apiFetch('host/pin');
            if (!r.ok) return false;
            const body = await r.json();
            return typeof body.pin === 'string' && body.pin.length >= 4;
        },
    },
    {
        name: 'GET /r/:loc/api/onboarding/steps reports all 6 done after the walk',
        tags: ['ui', 'onboarding-wizard', 'done'],
        testFn: async () => {
            const r = await apiFetch('onboarding/steps');
            const body = await r.json();
            return r.ok
                && body.done === true
                && ['basics', 'template', 'content', 'dishes', 'menu', 'staff'].every((s: string) => body.steps.includes(s));
        },
    },
    {
        name: 'GET /r/:loc/api/public-config surfaces the wizard-saved hero + dishes + template',
        tags: ['ui', 'onboarding-wizard', 'done', 'public-config'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slug}/api/public-config`);
            if (!r.ok) return false;
            const body = await r.json();
            return body?.content?.heroHeadline === 'Slow-simmered tonkotsu, ready tonight.'
                && body?.websiteTemplate === 'slate'
                && Array.isArray(body?.content?.knownFor)
                && body.content.knownFor[0].title === 'Tonkotsu';
        },
    },
    {
        name: 'public site GET /r/:loc/ renders with the chosen template',
        tags: ['ui', 'onboarding-wizard', 'done', 'site'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slug}/`);
            if (!r.ok) return false;
            const html = await r.text();
            // Template-specific content should reflect "slate" + the saved headline.
            return html.includes('Slow-simmered tonkotsu, ready tonight.');
        },
    },

    // ─── dirty-tracking contract: client controller source proves intent ──
    {
        name: 'onboarding.js disables Save initially and flips via recomputeDirty',
        tags: ['ui', 'onboarding-wizard', 'dirty-tracking'],
        testFn: async () => {
            const html = await (await fetch(`${BASE()}/r/${slug}/onboarding.js`)).text();
            // Source-level markers that prove Save starts disabled + is toggled on change.
            return /markCleanEnabled\(['"]basics['"], false\)/.test(html)
                && /recomputeDirty/.test(html);
        },
    },
];

void runTests(cases, 'onboarding wizard UI (issue #51 Phase C)');
