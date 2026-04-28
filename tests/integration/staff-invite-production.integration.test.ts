// ============================================================================
// Integration test - production staff invite must fail closed without email
// ============================================================================
//
// In development, missing ACS email config is allowed to fall back to
// log-only mode so local dev can still inspect invite links. In production,
// owners should not be able to create a dead invite that no one can receive.
//
// This test proves that POST /r/:loc/api/staff/invite:
//   * returns 503 with code=invite_email_unavailable when ACS is unset
//   * leaves no active pending invite behind
// ============================================================================

process.env.SKB_COOKIE_SECRET ??= 'test-secret-for-ci';
process.env.MONGODB_DB_NAME ??= 'skb_staff_invite_prod_test';
process.env.NODE_ENV = 'production';
const STAFF_INVITE_PROD_PORT = String(16620 + Math.floor(Math.random() * 500));
process.env.PORT ??= STAFF_INVITE_PROD_PORT;
process.env.FRAIM_TEST_SERVER_PORT ??= STAFF_INVITE_PROD_PORT;
process.env.FRAIM_BRANCH ??= '';
process.env.SKB_HOST_PIN ??= '1234';
delete process.env.ACS_EMAIL_CONNECTION_STRING;
delete process.env.ACS_EMAIL_SENDER;

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    startTestServer,
    stopTestServer,
    getTestServerUrl,
} from '../shared-server-utils.js';
import {
    closeDb,
    getDb,
    users as usersColl,
    memberships as membershipsColl,
    invites as invitesColl,
} from '../../src/core/db/mongo.js';
import { createOwnerUser } from '../../src/services/users.js';

const LOC = 'skb';
const OWNER_EMAIL = 'staff-invite-prod-owner@example.test';
const OWNER_PASS = 'staff-invite-prod-password';
const INVITEE_EMAIL = 'staff-invite-prod-invitee@example.test';

function getCookie(res: Response, name: string): string | null {
    const raw = res.headers.get('set-cookie') ?? '';
    const idx = raw.indexOf(`${name}=`);
    if (idx < 0) return null;
    const end = raw.indexOf(';', idx);
    return raw.slice(idx, end === -1 ? undefined : end);
}

async function resetData(): Promise<void> {
    const db = await getDb();
    await usersColl(db).deleteMany({ email: { $in: [OWNER_EMAIL, INVITEE_EMAIL] } });
    await membershipsColl(db).deleteMany({ locationId: LOC });
    await invitesColl(db).deleteMany({ locationId: LOC, email: INVITEE_EMAIL });
}

async function loginOwner(): Promise<string | null> {
    const res = await fetch(`${getTestServerUrl()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASS, locationId: LOC }),
    });
    if (!res.ok) return null;
    return getCookie(res as unknown as Response, 'skb_session');
}

let ownerCookie: string | null = null;

const cases: BaseTestCase[] = [
    {
        name: 'setup: server + owner session',
        tags: ['integration', 'staff-invite-production', 'setup'],
        testFn: async () => {
            await startTestServer();
            await resetData();
            await createOwnerUser({
                email: OWNER_EMAIL,
                password: OWNER_PASS,
                name: 'Production Invite Owner',
                locationId: LOC,
            });
            ownerCookie = await loginOwner();
            return ownerCookie !== null;
        },
    },
    {
        name: 'production invite without ACS config → 503 + no active pending invite',
        tags: ['integration', 'staff-invite-production'],
        testFn: async () => {
            if (!ownerCookie) return false;
            const res = await fetch(`${getTestServerUrl()}/r/${LOC}/api/staff/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
                body: JSON.stringify({ email: INVITEE_EMAIL, name: 'Invitee Prod', role: 'host' }),
            });
            if (res.status !== 503) return false;
            const body = await res.json() as {
                error?: string;
                code?: string;
                delivery?: { delivered?: boolean; mode?: string; reason?: string };
            };
            if (body.code !== 'invite_email_unavailable') return false;
            if (body.delivery?.delivered !== false) return false;
            if (body.delivery?.mode !== 'log-only') return false;
            if (body.delivery?.reason !== 'missing_connection_string') return false;

            const db = await getDb();
            const activeInvite = await invitesColl(db).findOne({
                locationId: LOC,
                email: INVITEE_EMAIL,
                acceptedAt: { $exists: false },
                revokedAt: { $exists: false },
            });
            return activeInvite === null;
        },
    },
    {
        name: 'teardown: stop server + close db',
        tags: ['integration', 'staff-invite-production', 'teardown'],
        testFn: async () => {
            await closeDb();
            await stopTestServer();
            return true;
        },
    },
];

void runTests(cases, 'staff invite production fail-closed');
