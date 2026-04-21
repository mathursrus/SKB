// ============================================================================
// UI-ish test for the 7-tab admin workspace (issue #51, Phase B).
//
// Why stdlib HTTP, not Playwright:
//   Playwright is not yet a project devDep. Per the spec, when Playwright is
//   not installed we prefer a stdlib-HTTP test with assertions against the
//   served HTML and the real API round-trips. That's what this file does.
//   This catches the end-to-end contract that matters here:
//     (1) the admin page serves with all 7 tabs declared,
//     (2) signup → session cookie → admin.html round-trip works,
//     (3) the /r/:loc/api/config/website endpoint accepts a knownFor array
//         that mixes string URLs and { mime, data } uploads, and
//     (4) the persisted content flows back through /r/:loc/public-config so
//         the public site picks up new signature dishes.
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_admintabs_ui_test';
process.env.PORT ??= '13300';
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_LOG_EMAIL_BODY = '0';
process.env.SKB_SIGNUP_MAX_PER_WINDOW ??= '200';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, stopTestServer, getTestServerUrl } from '../shared-server-utils.js';

const BASE = () => getTestServerUrl();

// 1x1 PNG, base64 (minimum valid image for knownFor upload)
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
    const email = `admin-tabs-ui-${suffix}@example.com`;
    const res = await fetch(`${BASE()}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            restaurantName: `UI Tabs Diner ${suffix}`,
            city: 'Bellevue',
            ownerName: 'Tabs Owner',
            email,
            password: 'correct horse battery staple',
            tosAccepted: true,
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`signup failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { location: { id: string } };
    slug = data.location.id;
    sessionCookie = getCookie(res, 'skb_session') || '';
    if (!sessionCookie) throw new Error('signup did not set session cookie');
}

const cases: BaseTestCase[] = [
    // ─── prep ─────────────────────────────────────────────────────────
    {
        name: 'boot: dev server + signup + session cookie',
        tags: ['ui', 'admin-tabs', 'setup'],
        testFn: async () => {
            await startTestServer();
            await provisionOwner();
            return slug.length > 0 && sessionCookie.length > 0;
        },
    },

    // ─── served admin.html holds every tab + panel ────────────────────
    {
        name: 'GET /r/:loc/admin.html serves all 7 tab buttons',
        tags: ['ui', 'admin-tabs'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slug}/admin.html`);
            if (!r.ok) return false;
            const html = await r.text();
            for (const key of ['dashboard', 'profile', 'website', 'menu', 'frontdesk', 'staff', 'integrations']) {
                if (!new RegExp(`data-tab="${key}"`).test(html)) return false;
                if (!new RegExp(`id="admin-panel-${key}"`).test(html)) return false;
            }
            return true;
        },
    },
    {
        name: 'served admin.html has the 3 signature-dish file inputs with accept=image/*',
        tags: ['ui', 'admin-tabs', 'signature-dish'],
        testFn: async () => {
            const html = await (await fetch(`${BASE()}/r/${slug}/admin.html`)).text();
            const inputs = html.match(/<input[^>]*class="signature-dish-file"[^>]*accept="image\/\*"/g) || [];
            return inputs.length === 3;
        },
    },
    {
        name: 'served admin.html has the Regenerate PIN button',
        tags: ['ui', 'admin-tabs', 'frontdesk'],
        testFn: async () => {
            const html = await (await fetch(`${BASE()}/r/${slug}/admin.html`)).text();
            return /id="admin-device-pin-regen"/.test(html)
                && /Regenerate PIN/.test(html);
        },
    },
    {
        name: 'served admin.html has guest experience toggle controls',
        tags: ['ui', 'admin-tabs', 'frontdesk', 'guest-capabilities'],
        testFn: async () => {
            const html = await (await fetch(`${BASE()}/r/${slug}/admin.html`)).text();
            return /id="admin-guest-features-card"/.test(html)
                && /id="admin-guest-feature-order"/.test(html)
                && /id="admin-guest-feature-chat"/.test(html)
                && /id="admin-guest-feature-sms"/.test(html)
                && /id="admin-guest-features-save"/.test(html);
        },
    },

    // ─── Website save: mixed knownFor payload round-trips ─────────────
    {
        name: 'POST /r/:loc/api/config/website accepts knownFor with base64 upload + empty row',
        tags: ['ui', 'admin-tabs', 'website', 'signature-dish'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slug}/api/config/website`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': sessionCookie,
                },
                body: JSON.stringify({
                    websiteTemplate: 'saffron',
                    content: {
                        heroHeadline: 'UI test hero',
                        knownFor: [
                            {
                                title: 'Tonkotsu',
                                desc: '36-hour pork broth.',
                                image: { mime: 'image/png', data: ONE_PX_PNG_B64 },
                            },
                            {
                                title: 'Masala Dosa',
                                desc: 'Crispy crepe, spiced potato.',
                                image: '',
                            },
                        ],
                    },
                }),
            });
            if (!r.ok) {
                const body = await r.text();
                console.error('website POST failed:', r.status, body);
                return false;
            }
            const data = await r.json();
            const items = data?.content?.knownFor || [];
            if (items.length !== 2) return false;
            // Uploaded image must have been persisted to a /assets/<slug>/dishes/* URL.
            const first = items[0];
            if (typeof first.image !== 'string') return false;
            if (!/^\/assets\/[^/]+\/dishes\/[a-f0-9]+\.(png|jpg|jpeg|webp)$/.test(first.image)) return false;
            // Empty image passes through as an empty string.
            return items[1].image === '';
        },
    },
    {
        name: 'GET /r/:loc/api/public-config reflects the saved knownFor items',
        tags: ['ui', 'admin-tabs', 'website', 'signature-dish'],
        testFn: async () => {
            // hostRouter is mounted at /r/:loc/api — so the public-config
            // route is /r/:loc/api/public-config. (Unauthenticated; the
            // endpoint explicitly strips PIN + operational internals.)
            const r = await fetch(`${BASE()}/r/${slug}/api/public-config`);
            if (!r.ok) {
                console.error('public-config fetch:', r.status, await r.text());
                return false;
            }
            const data = await r.json();
            const items = data?.content?.knownFor || [];
            return items.length === 2
                && items[0].title === 'Tonkotsu'
                && /^\/assets\/[^/]+\/dishes\/[a-f0-9]+\./.test(items[0].image);
        },
    },

    // ─── Menu-tab placeholder saves menuUrl via visit-config ──────────
    {
        name: 'Menu tab save button hits visit-config and persists menuUrl',
        tags: ['ui', 'admin-tabs', 'menu'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slug}/api/host/visit-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
                body: JSON.stringify({ visitMode: 'auto', menuUrl: 'https://example.com/menu', closedMessage: null }),
            });
            if (!r.ok) return false;
            const verify = await (await fetch(`${BASE()}/r/${slug}/api/host/visit-config`, {
                headers: { 'Cookie': sessionCookie },
            })).json();
            return verify.menuUrl === 'https://example.com/menu';
        },
    },
    {
        name: 'POST /r/:loc/api/host/guest-features persists and flows to public-config',
        tags: ['ui', 'admin-tabs', 'guest-capabilities'],
        testFn: async () => {
            const save = await fetch(`${BASE()}/r/${slug}/api/host/guest-features`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': sessionCookie,
                },
                body: JSON.stringify({ order: false, chat: true, sms: false }),
            });
            if (!save.ok) return false;
            const publicConfig = await fetch(`${BASE()}/r/${slug}/api/public-config`);
            if (!publicConfig.ok) return false;
            const body = await publicConfig.json();
            return body.guestFeatures?.order === false
                && body.guestFeatures?.chat === true
                && body.guestFeatures?.sms === false;
        },
    },
    {
        name: 'teardown',
        tags: ['ui', 'admin-tabs', 'teardown'],
        testFn: async () => {
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'admin tabs UI (issue #51 Phase B)');
