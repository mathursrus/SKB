process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_guest_ordering_test';
process.env.PORT ??= '15393';
process.env.FRAIM_TEST_SERVER_PORT ??= '15393';
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

const LOC = 'guest-order-a';
const OWNER_EMAIL = 'guest-order-owner@example.test';
const OWNER_PASS = 'guest-order-password-long';

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

async function pinUnlock(): Promise<string | null> {
    if (!ownerCookie) return null;
    const res = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({ pin: '1111' }),
    });
    if (!res.ok) return null;
    return cookieFromRes(res as unknown as Response, 'skb_host');
}

let ownerCookie: string | null = null;
let hostCookie: string | null = null;
let code = '';
let entryId = '';

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + tenant + owner + host session',
        tags: ['integration', 'guest-ordering', 'setup'],
        testFn: async () => {
            await startTestServer();
            const db = await getDb();
            await locations(db).deleteMany({ _id: LOC });
            await queueEntries(db).deleteMany({ locationId: LOC });
            await usersColl(db).deleteMany({ email: OWNER_EMAIL });
            await membershipsColl(db).deleteMany({ locationId: LOC });
            await ensureLocation(LOC, 'Guest Order', '1111');
            await createOwnerUser({ email: OWNER_EMAIL, password: OWNER_PASS, name: 'Owner', locationId: LOC });
            ownerCookie = await loginAsOwner(LOC);
            hostCookie = await pinUnlock();
            return !!ownerCookie && !!hostCookie;
        },
    },
    {
        name: 'owner saves rich structured menu',
        tags: ['integration', 'guest-ordering', 'menu'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/menu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': ownerCookie! },
                body: JSON.stringify({
                    menu: {
                        sections: [{
                            id: 's1',
                            title: 'Dosas',
                            items: [{
                                id: 'i1',
                                name: 'Masala Dosa',
                                description: 'Crisp and golden.',
                                price: '$12',
                                requiredIngredients: ['Potato masala', 'Sambar'],
                                optionalIngredients: ['Coconut chutney', 'Extra ghee'],
                            }],
                        }],
                    },
                }),
            });
            return res.status === 200;
        },
    },
    {
        name: 'guest joins queue and can save draft before seating',
        tags: ['integration', 'guest-ordering', 'draft'],
        testFn: async () => {
            const join = await fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Asha', partySize: 2, phone: '2065551234', smsConsent: false }),
            });
            if (!join.ok) return false;
            const joinBody = await join.json();
            code = joinBody.code;

            const draft = await fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/order/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    lines: [{
                        menuItemId: 'i1',
                        quantity: 2,
                        notes: 'One extra crisp',
                        selectedOptions: ['Coconut chutney'],
                    }],
                }),
            });
            if (!draft.ok) return false;
            const draftBody = await draft.json();
            const status = await fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/status?code=${encodeURIComponent(code)}`);
            const statusBody = await status.json();
            return draftBody.state === 'draft'
                && statusBody.order?.state === 'draft'
                && statusBody.canPlaceOrder === false;
        },
    },
    {
        name: 'guest place-order is blocked before seating',
        tags: ['integration', 'guest-ordering', 'state-gate'],
        testFn: async () => {
            const res = await fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/order/place`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const body = await res.json().catch(() => ({}));
            return res.status === 400 && String(body.error || '').includes('order.state');
        },
    },
    {
        name: 'host seats the party and guest placement advances state to ordered',
        tags: ['integration', 'guest-ordering', 'placement'],
        testFn: async () => {
            const queueRes = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/queue`, {
                headers: { 'Cookie': hostCookie! },
            });
            const queueBody = await queueRes.json();
            entryId = queueBody.parties[0].id;
            const seat = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/queue/${encodeURIComponent(entryId)}/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cookie': hostCookie! },
                body: JSON.stringify({ reason: 'seated', tableNumber: 12 }),
            });
            if (!seat.ok) return false;
            const placed = await fetch(`${getTestServerUrl()}/r/${LOC}/api/queue/order/place`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!placed.ok) return false;
            const dining = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/dining`, {
                headers: { 'Cookie': hostCookie! },
            });
            const diningBody = await dining.json();
            const party = diningBody.parties.find((row: { id: string }) => row.id === entryId);
            return party?.state === 'ordered';
        },
    },
    {
        name: 'host order detail shows the placed order on the seated-party record',
        tags: ['integration', 'guest-ordering', 'host-view'],
        testFn: async () => {
            const order = await fetch(`${getTestServerUrl()}/r/${LOC}/api/host/queue/${encodeURIComponent(entryId)}/order`, {
                headers: { 'Cookie': hostCookie! },
            });
            if (!order.ok) return false;
            const body = await order.json();
            return body.state === 'placed'
                && body.lines.length === 1
                && body.lines[0].name === 'Masala Dosa'
                && body.lines[0].selectedOptions[0] === 'Coconut chutney'
                && body.lines[0].notes === 'One extra crisp';
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'guest-ordering', 'teardown'],
        testFn: async () => {
            await stopTestServer();
            await closeDb();
            return true;
        },
    },
];

runTests(cases, 'guest ordering integration (issue #11)');
