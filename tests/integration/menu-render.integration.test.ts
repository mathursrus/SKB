// Integration test for the structured-menu → public /menu render path.
//
// Covers the "two-sided feature" contract: when an owner saves a structured
// menu via POST /r/:loc/api/host/menu, the data must reach the public
// `/r/:loc/menu` page rendered by the template renderer. Catches the gap
// that the original Menu Builder landing missed (the admin side persisted
// but the saffron/slate menu.html still showed "Menu coming soon").
//
// Also asserts XSS safety: a literal `<script>` payload in an item name
// must appear HTML-escaped in the rendered response, not as a live tag.

const MENU_RENDER_IT_PORT = '15473';

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_menu_render_test';
process.env.PORT ??= MENU_RENDER_IT_PORT;
process.env.FRAIM_TEST_SERVER_PORT ??= MENU_RENDER_IT_PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
    getTestServerPort,
    isPortInUse,
} from '../shared-server-utils.js';
import {
    closeDb,
    getDb,
    locations,
    users as usersColl,
    memberships as membershipsColl,
} from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';
import { createOwnerUser } from '../../src/services/users.js';

const LOC = 'menu-render-a';
const OWNER_EMAIL = 'menu-render-owner@example.test';
const OWNER_PASS = 'menu-render-password-long';

async function assertFreshServerPort(): Promise<void> {
    const port = getTestServerPort();
    if (await isPortInUse(port)) {
        throw new Error(
            `menu-render integration requires an isolated server, but port ${port} is already in use`,
        );
    }
}

function cookieFromRes(res: Response, name: string): string | null {
    const raw = res.headers.get('set-cookie') ?? '';
    const idx = raw.indexOf(`${name}=`);
    if (idx < 0) return null;
    const end = raw.indexOf(';', idx);
    return raw.slice(idx, end === -1 ? undefined : end);
}

async function loginAs(email: string, password: string, locationId: string): Promise<string | null> {
    const res = await fetch(`${getTestServerUrl()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, locationId }),
    });
    if (!res.ok) return null;
    return cookieFromRes(res as unknown as Response, 'skb_session');
}

let ownerCookie: string | null = null;

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + tenant + owner',
        tags: ['integration', 'menu-render', 'setup'],
        testFn: async () => {
            await assertFreshServerPort();
            await startTestServer();
            const db = await getDb();
            await locations(db).deleteMany({ _id: LOC });
            await usersColl(db).deleteMany({ email: OWNER_EMAIL });
            await membershipsColl(db).deleteMany({ locationId: LOC });
            await ensureLocation(LOC, 'Menu Render Test', '1234');
            await createOwnerUser({ email: OWNER_EMAIL, password: OWNER_PASS, name: 'Owner', locationId: LOC });
            ownerCookie = await loginAs(OWNER_EMAIL, OWNER_PASS, LOC);
            return !!ownerCookie;
        },
    },

    {
        name: 'empty tenant → public /menu page shows the "Menu coming soon" fallback',
        tags: ['integration', 'menu-render', 'fallback'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/menu`);
            if (r.status !== 200) return false;
            const html = await r.text();
            return html.includes('Menu coming soon')
                && !html.includes('{{#each menu.sections}}')
                && !html.includes('{{#unless menuHasSections}}');
        },
    },

    {
        name: 'after POST /host/menu → public /menu page renders saved sections + items',
        tags: ['integration', 'menu-render', 'happy'],
        testFn: async () => {
            const saveRes = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({
                    menu: {
                        sections: [
                            {
                                id: 's1', title: 'Appetizers',
                                items: [
                                    { id: 'i1', name: 'Samosa', price: '$6' },
                                    { id: 'i2', name: 'Pakora', description: 'Spiced and fried.', price: '$8' },
                                ],
                            },
                            {
                                id: 's2', title: 'Mains',
                                items: [{ id: 'i3', name: 'Biryani', price: '$18' }],
                            },
                        ],
                    },
                }),
            });
            if (saveRes.status !== 200) return false;

            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/menu`);
            if (r.status !== 200) return false;
            const html = await r.text();
            // Section titles + item names must appear in the rendered HTML.
            return html.includes('Appetizers')
                && html.includes('Mains')
                && html.includes('Samosa')
                && html.includes('Pakora')
                && html.includes('Spiced and fried.')
                && html.includes('$6')
                && html.includes('$8')
                && html.includes('Biryani')
                && html.includes('$18')
                && html.includes('menu-section-nav')
                // Fallback must NOT render when sections exist.
                && !html.includes('Menu coming soon');
        },
    },

    {
        name: 'item without price: the price span is OMITTED (not rendered empty)',
        tags: ['integration', 'menu-render', 'conditional'],
        testFn: async () => {
            await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({
                    menu: { sections: [{ id: 's1', title: 'Priceless', items: [{ id: 'i1', name: 'Ask your server' }] }] },
                }),
            });
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/menu`);
            const html = await r.text();
            // Item name renders, but the price span should not appear at all.
            return html.includes('Ask your server')
                && !/saffron-menu-item-price[^>]*>\s*<\/span>/.test(html)
                && !/slate-menu-item-price[^>]*>\s*<\/span>/.test(html);
        },
    },
    {
        name: 'rich menu fields render image and ingredient content on the public menu page',
        tags: ['integration', 'menu-render', 'rich-menu'],
        testFn: async () => {
            await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({
                    menu: {
                        sections: [{
                            id: 's-rich',
                            title: 'Specials',
                            items: [{
                                id: 'i-rich',
                                name: 'Masala Dosa',
                                image: '/assets/skb/menu/masala-dosa.jpg',
                                requiredIngredients: ['Potato masala'],
                                optionalIngredients: ['Extra ghee'],
                            }],
                        }],
                    },
                }),
            });
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/menu`);
            const html = await r.text();
            return html.includes('/assets/skb/menu/masala-dosa.jpg')
                && html.includes('Potato masala')
                && html.includes('Extra ghee');
        },
    },

    {
        name: 'XSS payload in item name is HTML-escaped in the rendered response',
        tags: ['integration', 'menu-render', 'xss'],
        testFn: async () => {
            await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({
                    menu: { sections: [{ id: 's1', title: 'XSS', items: [{ id: 'i1', name: '<script>alert(1)</script>' }] }] },
                }),
            });
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/menu`);
            const html = await r.text();
            // Must contain the escaped version, must NOT contain the live tag.
            return html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')
                && !html.includes('<script>alert(1)</script>');
        },
    },

    {
        name: 'after clearing the menu (menu:null) the fallback re-renders',
        tags: ['integration', 'menu-render', 'fallback'],
        testFn: async () => {
            await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ menu: null }),
            });
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/menu`);
            const html = await r.text();
            return html.includes('Menu coming soon');
        },
    },

    {
        name: 'teardown',
        tags: ['integration', 'menu-render', 'teardown'],
        testFn: async () => {
            ownerCookie = null;
            await stopTestServer();
            await closeDb();
            return true;
        },
    },
];

runTests(cases, 'menu render integration (issue #51 follow-up)');
