// Integration tests for the menu-builder + Device-PIN admin routes added in
// issue #51. Exercises the full HTTP pipeline:
//   · GET  /r/:loc/api/menu            — public, no auth
//   · POST /r/:loc/api/host/menu       — requireAdmin (owner/admin session)
//   · GET  /r/:loc/api/host/pin        — requireAdmin
//   · POST /r/:loc/api/host/pin        — requireAdmin
//
// Also covers the common failure modes (PIN-only auth denied, cross-tenant
// denied, shape validation, unauth GET /menu returns 200).

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_menu_pin_test';
process.env.PORT ??= '15392';
process.env.FRAIM_TEST_SERVER_PORT ??= '15392';
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
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

const LOC = 'menu-pin-a';
const OTHER_LOC = 'menu-pin-b';
const OWNER_EMAIL = 'menu-owner@example.test';
const OWNER_PASS = 'menu-owner-password-long';

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

async function pinUnlock(loc: string, pin: string): Promise<string | null> {
    if (!ownerCookie) return null;
    const res = await fetch(`${getTestServerUrl()}/r/${loc}/api/host/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({ pin }),
    });
    if (!res.ok) return null;
    return cookieFromRes(res as unknown as Response, 'skb_host');
}

let ownerCookie: string | null = null;
let pinCookieA: string | null = null;

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + tenants + owner + sessions',
        tags: ['integration', 'menu-pin', 'setup'],
        testFn: async () => {
            await startTestServer();
            const db = await getDb();
            await locations(db).deleteMany({ _id: { $in: [LOC, OTHER_LOC] } });
            await usersColl(db).deleteMany({ email: OWNER_EMAIL });
            await membershipsColl(db).deleteMany({ locationId: { $in: [LOC, OTHER_LOC] } });
            await ensureLocation(LOC, 'Menu-A', '1111');
            await ensureLocation(OTHER_LOC, 'Menu-B', '2222');
            await createOwnerUser({ email: OWNER_EMAIL, password: OWNER_PASS, name: 'Owner', locationId: LOC });
            ownerCookie = await loginAs(OWNER_EMAIL, OWNER_PASS, LOC);
            pinCookieA = await pinUnlock(LOC, '1111');
            return !!ownerCookie && !!pinCookieA;
        },
    },

    // ── GET /menu — public ─────────────────────────────────────────────
    {
        name: 'GET /menu is public (no cookie) and returns empty shape for fresh tenant',
        tags: ['integration', 'menu-pin', 'public'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/menu`);
            if (r.status !== 200) return false;
            const data = await r.json();
            return Array.isArray(data.menu?.sections)
                && data.menu.sections.length === 0
                && typeof data.menuUrl === 'string';
        },
    },

    // ── POST /host/menu — auth ─────────────────────────────────────────
    {
        name: 'POST /host/menu with NO auth → 401',
        tags: ['integration', 'menu-pin', 'auth'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ menu: { sections: [] } }),
            });
            return r.status === 401;
        },
    },
    {
        name: 'POST /host/menu with PIN-only cookie → 403 forbidden (host role cannot save menu)',
        tags: ['integration', 'menu-pin', 'auth'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': pinCookieA! },
                body: JSON.stringify({ menu: { sections: [] } }),
            });
            const body = await r.json().catch(() => ({}));
            return r.status === 403 && body.error === 'forbidden';
        },
    },
    {
        name: 'POST /host/menu as owner → 200 and persists',
        tags: ['integration', 'menu-pin', 'happy'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({
                    menu: {
                        sections: [
                            { id: 's1', title: 'Mains', items: [{ id: 'i1', name: 'Biryani', price: '$18' }] },
                        ],
                    },
                }),
            });
            if (r.status !== 200) return false;
            const data = await r.json();
            if (!data.ok) return false;
            // Verify public GET reflects the saved shape.
            const g = await fetch(`${getTestServerUrl()}/r/${LOC}/api/menu`);
            const gd = await g.json();
            return gd.menu.sections.length === 1
                && gd.menu.sections[0].title === 'Mains'
                && gd.menu.sections[0].items[0].name === 'Biryani';
        },
    },
    {
        name: 'POST /host/menu with menu:null clears and GET returns empty',
        tags: ['integration', 'menu-pin', 'happy'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ menu: null }),
            });
            if (r.status !== 200) return false;
            const g = await fetch(`${getTestServerUrl()}/r/${LOC}/api/menu`);
            const gd = await g.json();
            return gd.menu.sections.length === 0;
        },
    },
    {
        name: 'POST /host/menu rejects malformed payload with 400',
        tags: ['integration', 'menu-pin', 'validation'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ menu: { sections: 'not an array' } }),
            });
            return r.status === 400;
        },
    },
    {
        name: 'POST /host/menu rejects empty section.title',
        tags: ['integration', 'menu-pin', 'validation'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({
                    menu: { sections: [{ id: 'sx', title: '', items: [] }] },
                }),
            });
            const body = await r.json().catch(() => ({}));
            return r.status === 400 && typeof body.error === 'string' && body.error.includes('title');
        },
    },

    // ── POST /host/pin — auth + shape ──────────────────────────────────
    {
        name: 'POST /host/pin with NO auth → 401',
        tags: ['integration', 'menu-pin', 'pin', 'auth'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: '2222' }),
            });
            return r.status === 401;
        },
    },
    {
        name: 'POST /host/pin with PIN-only cookie → 403 (host role cannot change PIN)',
        tags: ['integration', 'menu-pin', 'pin', 'auth'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': pinCookieA! },
                body: JSON.stringify({ pin: '9999' }),
            });
            return r.status === 403;
        },
    },
    {
        name: 'POST /host/pin rejects 3-digit pin',
        tags: ['integration', 'menu-pin', 'pin', 'validation'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ pin: '123' }),
            });
            return r.status === 400;
        },
    },
    {
        name: 'POST /host/pin rejects non-numeric pin',
        tags: ['integration', 'menu-pin', 'pin', 'validation'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ pin: '12ab' }),
            });
            return r.status === 400;
        },
    },
    {
        name: 'POST /host/pin happy path — 4-digit + GET returns the new value',
        tags: ['integration', 'menu-pin', 'pin', 'happy'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ pin: '4321' }),
            });
            if (r.status !== 200) return false;
            const g = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/pin`, {
                headers: { 'Cookie': ownerCookie! },
            });
            if (g.status !== 200) return false;
            const gd = await g.json();
            return gd.pin === '4321';
        },
    },
    {
        name: 'POST /host/pin accepts 6-digit pin (upper bound)',
        tags: ['integration', 'menu-pin', 'pin', 'happy'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ pin: '987654' }),
            });
            return r.status === 200;
        },
    },
    {
        name: 'POST /host/pin rejects 7-digit pin',
        tags: ['integration', 'menu-pin', 'pin', 'validation'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ pin: '1234567' }),
            });
            return r.status === 400;
        },
    },

    // ── Cross-tenant probe ─────────────────────────────────────────────
    {
        name: 'owner session for LOC cannot POST /host/menu at OTHER_LOC (session falls through to PIN check)',
        tags: ['integration', 'menu-pin', 'cross-tenant'],
        testFn: async () => {
            const r = await fetch(`${getTestServerUrl()}/r/${OTHER_LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ menu: { sections: [] } }),
            });
            // Session wrong-tenant falls through; no PIN cookie → 401.
            return r.status === 401;
        },
    },

    {
        name: 'teardown',
        tags: ['integration', 'menu-pin', 'teardown'],
        testFn: async () => {
            await stopTestServer();
            await closeDb();
            return true;
        },
    },
];

runTests(cases, 'menu + device-PIN integration (issue #51)');
