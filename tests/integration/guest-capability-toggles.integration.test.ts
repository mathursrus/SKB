process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_guest_capability_toggles_test';
process.env.PORT ??= '15471';
process.env.FRAIM_TEST_SERVER_PORT ??= process.env.PORT;
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
    queueEntries,
    users as usersColl,
    memberships as membershipsColl,
} from '../../src/core/db/mongo.js';
import { ensureLocation } from '../../src/services/locations.js';
import { createOwnerUser } from '../../src/services/users.js';

const LOC = 'guest-cap-flags-a';
const OWNER_EMAIL = 'guest-cap-owner@example.test';
const OWNER_PASS = 'guest-cap-password-long';

function cookieFromRes(res: Response, name: string): string | null {
    const raw = res.headers.get('set-cookie') ?? '';
    const idx = raw.indexOf(`${name}=`);
    if (idx < 0) return null;
    const end = raw.indexOf(';', idx);
    return raw.slice(idx, end === -1 ? undefined : end);
}

async function loginAsOwner(locationId: string): Promise<string | null> {
    const res = await fetch(`${getTestServerUrl()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS, locationId }),
    });
    if (!res.ok) return null;
    return cookieFromRes(res as unknown as Response, 'skb_session');
}

let ownerCookie: string | null = null;
let guestCode = '';

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + tenant + owner session',
        tags: ['integration', 'guest-capabilities', 'setup'],
        testFn: async () => {
            await startTestServer();
            const db = await getDb();
            await locations(db).deleteMany({ _id: LOC });
            await queueEntries(db).deleteMany({ locationId: LOC });
            await usersColl(db).deleteMany({ email: OWNER_EMAIL });
            await membershipsColl(db).deleteMany({ locationId: LOC });
            await ensureLocation(LOC, 'Guest Capabilities', '1111');
            await createOwnerUser({ email: OWNER_EMAIL, password: OWNER_PASS, name: 'Owner', locationId: LOC });
            ownerCookie = await loginAsOwner(LOC);
            return !!ownerCookie;
        },
    },
    {
        name: 'owner can publish a structured menu for guest browsing checks',
        tags: ['integration', 'guest-capabilities', 'menu'],
        testFn: async () => {
            const save = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({
                    menu: {
                        sections: [{
                            id: 's1',
                            title: 'Dosas',
                            items: [{ id: 'i1', name: 'Masala Dosa', price: '$12' }],
                        }],
                    },
                }),
            });
            return save.ok;
        },
    },
    {
        name: 'admin can save guest capabilities and public-config reflects them',
        tags: ['integration', 'guest-capabilities', 'config'],
        testFn: async () => {
            const save = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/guest-features`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ menu: true, order: false, chat: false, sms: false }),
            });
            if (!save.ok) return false;
            const publicConfig = await fetch(`${getTestServerUrl()}/r/${LOC}/api/public-config`);
            if (!publicConfig.ok) return false;
            const body = await publicConfig.json();
            return body.guestFeatures?.menu === true
                && body.guestFeatures?.order === false
                && body.guestFeatures?.chat === false
                && body.guestFeatures?.sms === false;
        },
    },
    {
        name: 'join ignores smsConsent when SMS updates are disabled',
        tags: ['integration', 'guest-capabilities', 'sms'],
        testFn: async () => {
            const join = await fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Asha', partySize: 2, phone: '2065551234', smsConsent: true }),
            });
            if (!join.ok) return false;
            const joinBody = await join.json();
            guestCode = joinBody.code;
            const db = await getDb();
            const entry = await queueEntries(db).findOne({ code: guestCode });
            return entry?.smsConsent === false;
        },
    },
    {
        name: 'menu browsing remains available while ordering is disabled',
        tags: ['integration', 'guest-capabilities', 'menu'],
        testFn: async () => {
            const [menuRes, statusRes] = await Promise.all([
                fetch(`${getTestServerUrl()}/r/${LOC}/api/menu`),
                fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/status?code=${encodeURIComponent(guestCode)}`),
            ]);
            if (!menuRes.ok || !statusRes.ok) return false;
            const menuBody = await menuRes.json();
            const statusBody = await statusRes.json();
            return menuBody.menu?.sections?.[0]?.items?.[0]?.name === 'Masala Dosa'
                && statusBody.canManageOrder === false
                && statusBody.canPlaceOrder === false;
        },
    },
    {
        name: 'order endpoints reject when ordering is disabled',
        tags: ['integration', 'guest-capabilities', 'order'],
        testFn: async () => {
            const [getRes, draftRes, placeRes] = await Promise.all([
                fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/order?code=${encodeURIComponent(guestCode)}`),
                fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/order/draft`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: guestCode, lines: [] }),
                }),
                fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/order/place`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: guestCode }),
                }),
            ]);
            return getRes.status === 403 && draftRes.status === 403 && placeRes.status === 403;
        },
    },
    {
        name: 'chat endpoints reject when chat is disabled',
        tags: ['integration', 'guest-capabilities', 'chat'],
        testFn: async () => {
            const [getRes, postRes] = await Promise.all([
                fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/chat/${encodeURIComponent(guestCode)}`),
                fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/chat/${encodeURIComponent(guestCode)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ body: 'hello' }),
                }),
            ]);
            return getRes.status === 403 && postRes.status === 403;
        },
    },
    {
        name: 'mixed capability save keeps notify-compatible SMS off while chat and order are on',
        tags: ['integration', 'guest-capabilities', 'mixed'],
        testFn: async () => {
            const save = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/guest-features`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({ menu: true, order: true, chat: true, sms: false }),
            });
            if (!save.ok) return false;
            const body = await save.json();
            return body.menu === true && body.order === true && body.chat === true && body.sms === false;
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'guest-capabilities', 'teardown'],
        testFn: async () => {
            await stopTestServer();
            await closeDb();
            return true;
        },
    },
];

runTests(cases, 'guest capability toggles integration');
