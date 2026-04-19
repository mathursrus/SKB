// ============================================================================
// UI-contract test for the structured menu builder (issue #51 follow-up).
//
// Uses the stdlib-HTTP pattern (no Playwright devDep): signs up an owner,
// verifies the served admin.html declares the menu builder DOM the JS
// layer depends on, then round-trips a menu through the real API and
// confirms the public /api/menu endpoint reflects it.
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_menu_builder_ui_test';
process.env.PORT ??= '13355';
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';
process.env.SKB_SIGNUP_MAX_PER_WINDOW ??= '200';

import { runTests, type BaseTestCase } from '../test-utils.js';
import { startTestServer, getTestServerUrl } from '../shared-server-utils.js';

const BASE = () => getTestServerUrl();

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
    const email = `menu-builder-ui-${suffix}@example.com`;
    const r = await fetch(`${BASE()}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            restaurantName: `Menu UI ${suffix}`,
            city: 'Bellevue',
            ownerName: 'Menu Owner',
            email,
            password: 'correct horse battery staple',
            tosAccepted: true,
        }),
    });
    if (!r.ok) throw new Error(`signup failed ${r.status}`);
    const body = await r.json();
    slug = body.location?.id ?? body.locationId ?? '';
    sessionCookie = getCookie(r as unknown as Response, 'skb_session') ?? '';
}

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + owner signup',
        tags: ['ui', 'menu-builder', 'setup'],
        testFn: async () => { await startTestServer(); await provisionOwner(); return !!slug && !!sessionCookie; },
    },

    // ── DOM contract ───────────────────────────────────────────────────
    {
        name: 'served admin.html exposes the menu-builder DOM',
        tags: ['ui', 'menu-builder', 'dom'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slug}/admin.html`);
            if (!r.ok) return false;
            const html = await r.text();
            return /id="admin-menu-builder-card"/.test(html)
                && /id="admin-menu-sections"/.test(html)
                && /id="admin-menu-add-section"/.test(html)
                && /id="admin-menu-save"/.test(html)
                && /id="admin-menu-url-card"/.test(html)
                && /id="admin-menu-url"/.test(html)
                && /id="admin-menu-url-save"/.test(html);
        },
    },
    {
        name: 'served admin.html uses a <button> for "Pick image" (not <label>-wrap)',
        tags: ['ui', 'menu-builder', 'image-picker'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/r/${slug}/admin.html`);
            const html = await r.text();
            const hasButton = /data-sig-pick[^>]*>Pick image</.test(html)
                || /class="[^"]*signature-dish-pickbtn[^"]*"[^>]*data-sig-pick/.test(html);
            const hasLabel = /<label[^>]*class="signature-dish-filebtn"/.test(html);
            return hasButton && !hasLabel;
        },
    },
    {
        name: 'admin.js wires the Pick button to trigger the hidden file input',
        tags: ['ui', 'menu-builder', 'image-picker', 'admin-js'],
        testFn: async () => {
            const r = await fetch(`${BASE()}/admin.js`);
            const js = await r.text();
            return /data-sig-pick/.test(js) && /file\.click\(\)/.test(js);
        },
    },

    // ── API round-trip ─────────────────────────────────────────────────
    {
        name: 'owner can POST a multi-section menu and public GET reflects it',
        tags: ['ui', 'menu-builder', 'roundtrip'],
        testFn: async () => {
            const payload = {
                menu: {
                    sections: [
                        {
                            id: 's1', title: 'Apps',
                            items: [
                                { id: 'i1', name: 'Samosa', price: '$6' },
                                { id: 'i2', name: 'Pakora', description: 'Spiced, fried.', price: '$8' },
                            ],
                        },
                        {
                            id: 's2', title: 'Mains',
                            items: [{ id: 'i3', name: 'Biryani', price: '$18' }],
                        },
                    ],
                },
            };
            const save = await fetch(`${BASE()}/r/${slug}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
                body: JSON.stringify(payload),
            });
            if (save.status !== 200) return false;
            const r = await fetch(`${BASE()}/r/${slug}/api/menu`);
            if (r.status !== 200) return false;
            const data = await r.json();
            const s1 = data.menu.sections[0];
            const s2 = data.menu.sections[1];
            return data.menu.sections.length === 2
                && s1.title === 'Apps' && s1.items.length === 2
                && s1.items[0].name === 'Samosa'
                && s2.title === 'Mains' && s2.items[0].price === '$18';
        },
    },
    {
        name: 'menu save trims whitespace and drops empty description/price',
        tags: ['ui', 'menu-builder', 'normalization'],
        testFn: async () => {
            const r1 = await fetch(`${BASE()}/r/${slug}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
                body: JSON.stringify({
                    menu: {
                        sections: [{
                            id: 'n1',
                            title: '   Drinks   ',
                            items: [{ id: 'd1', name: '  Chai  ', description: '', price: '   ' }],
                        }],
                    },
                }),
            });
            if (r1.status !== 200) return false;
            const r2 = await fetch(`${BASE()}/r/${slug}/api/menu`);
            const data = await r2.json();
            const sec = data.menu.sections[0];
            const it = sec.items[0];
            return sec.title === 'Drinks'
                && it.name === 'Chai'
                && it.description === undefined
                && it.price === undefined;
        },
    },

    {
        name: 'teardown',
        tags: ['ui', 'menu-builder', 'teardown'],
        testFn: async () => true, // startTestServer is shared; harness teardown handled in main runner
    },
];

runTests(cases, 'menu builder UI (issue #51)');
