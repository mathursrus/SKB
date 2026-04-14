// Integration tests for SMS notification flow against real MongoDB.
// Covers: join with phone, call with smsStatus, CallRecord in DB, phoneMasked in host queue,
//         repeat calls with increasing count, phone not leaked in public APIs.
//
// SMS is NOT configured in test env (no TWILIO_* vars), so smsStatus will be 'not_configured'.
// This validates the full flow without requiring Twilio credentials.

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_sms_integration_test';
process.env.FRAIM_BRANCH = '';
// Ensure Twilio is NOT configured for these tests
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_PHONE_NUMBER;

import { closeDb, getDb, queueEntries, settings } from '../../src/core/db/mongo.js';
import {
    joinQueue,
    getStatusByCode,
    listHostQueue,
    callParty,
    getBoardEntries,
} from '../../src/services/queue.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
}

const cases: BaseTestCase[] = [
    // -- Join with phone --
    {
        name: 'sms: join stores full phone number in DB',
        tags: ['integration', 'sms', 'join'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Sid', partySize: 4, phone: '5127753555' });
            const db = await getDb();
            const entry = await queueEntries(db).findOne({ code: r.code });
            return entry !== null && entry.phone === '5127753555';
        },
    },
    {
        name: 'sms: join response does not contain phone number (no PII leak)',
        tags: ['integration', 'sms', 'join', 'privacy'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' });
            const json = JSON.stringify(r);
            return !json.includes('5127753555') && !json.includes('phone');
        },
    },

    // -- Host queue shows masked phone (plus optional host-only dial field) --
    {
        name: 'sms: host queue returns phoneMasked, not bare phone',
        tags: ['integration', 'sms', 'host-queue', 'privacy'],
        testFn: async () => {
            await resetDb();
            await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' });
            const q = await listHostQueue('test');
            const party = q.parties[0];
            // Must be masked for display.
            if (party.phoneMasked !== '******3555') return false;
            // Must never expose a bare `phone` key.
            if ('phone' in party) return false;
            // phoneForDial is a new host-only field populated behind the
            // PIN-gated /host route so the browser can use a tel: anchor.
            // It is allowed (and expected) to contain the full E.164 number
            // here; the privacy guard is that this field MUST NEVER appear
            // on any diner-facing (/queue/*) response — see the snapshot
            // test in tests/integration/queue.integration.test.ts.
            return typeof party.phoneForDial === 'string'
                && party.phoneForDial === '+15127753555';
        },
    },

    // -- Call with SMS status --
    {
        name: 'sms: callParty returns smsStatus (not_configured when no Twilio)',
        tags: ['integration', 'sms', 'call'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' });
            const q = await listHostQueue('test');
            const id = q.parties[0].id;
            const result = await callParty(id);
            return result.ok === true && result.smsStatus === 'not_configured';
        },
    },
    {
        name: 'sms: callParty creates CallRecord with smsStatus in DB',
        tags: ['integration', 'sms', 'call', 'db'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' });
            const q = await listHostQueue('test');
            const id = q.parties[0].id;
            await callParty(id);
            const db = await getDb();
            const entry = await queueEntries(db).findOne({ code: r.code });
            if (!entry || !entry.calls || entry.calls.length !== 1) return false;
            const call = entry.calls[0];
            return (
                call.at instanceof Date &&
                call.smsStatus === 'not_configured' &&
                entry.state === 'called'
            );
        },
    },

    // -- Repeat calls accumulate CallRecords --
    {
        name: 'sms: two calls create two CallRecords with correct smsStatus',
        tags: ['integration', 'sms', 'call', 'repeat'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-09T12:00:00Z');
            const r = await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' }, t0);
            const q = await listHostQueue('test', t0);
            const id = q.parties[0].id;

            const t1 = new Date('2026-04-09T12:05:00Z');
            const call1 = await callParty(id, t1);
            const t2 = new Date('2026-04-09T12:10:00Z');
            const call2 = await callParty(id, t2);

            const db = await getDb();
            const entry = await queueEntries(db).findOne({ code: r.code });
            if (!entry || !entry.calls || entry.calls.length !== 2) return false;
            return (
                call1.ok && call2.ok &&
                entry.calls[0].smsStatus === 'not_configured' &&
                entry.calls[1].smsStatus === 'not_configured'
            );
        },
    },

    // -- Host queue shows structured calls --
    {
        name: 'sms: host queue returns calls with minutesAgo and smsStatus',
        tags: ['integration', 'sms', 'host-queue', 'call'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-09T12:00:00Z');
            await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' }, t0);
            const q0 = await listHostQueue('test', t0);
            const id = q0.parties[0].id;

            await callParty(id, new Date('2026-04-09T12:05:00Z'));
            await callParty(id, new Date('2026-04-09T12:10:00Z'));

            const t3 = new Date('2026-04-09T12:15:00Z');
            const q1 = await listHostQueue('test', t3);
            const party = q1.parties[0];

            return (
                party.calls.length === 2 &&
                party.calls[0].minutesAgo === 10 &&
                party.calls[0].smsStatus === 'not_configured' &&
                party.calls[1].minutesAgo === 5 &&
                party.calls[1].smsStatus === 'not_configured'
            );
        },
    },

    // -- Public status does NOT leak phone or SMS data --
    {
        name: 'sms: diner status response has no phone data after being called',
        tags: ['integration', 'sms', 'status', 'privacy'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' });
            const q = await listHostQueue('test');
            await callParty(q.parties[0].id);

            const status = await getStatusByCode(r.code);
            const json = JSON.stringify(status);
            return (
                status.state === 'called' &&
                status.callsMinutesAgo.length === 1 &&
                !json.includes('5127753555') &&
                !json.includes('phone') &&
                !json.includes('smsStatus')
            );
        },
    },

    // -- Board does NOT leak phone data --
    {
        name: 'sms: board response has no phone or SMS data',
        tags: ['integration', 'sms', 'board', 'privacy'],
        testFn: async () => {
            await resetDb();
            await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' });
            const board = await getBoardEntries('test');
            const json = JSON.stringify(board);
            return (
                board.length === 1 &&
                !json.includes('5127753555') &&
                !json.includes('phone') &&
                !json.includes('smsStatus')
            );
        },
    },

    // -- Call proceeds even without SMS (R8) --
    {
        name: 'sms: call always succeeds regardless of SMS status (R8)',
        tags: ['integration', 'sms', 'call', 'resilience'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Sid', partySize: 2, phone: '5127753555' });
            const q = await listHostQueue('test');
            const id = q.parties[0].id;
            const result = await callParty(id);

            // Call succeeded even though SMS was not_configured
            const status = await getStatusByCode(r.code);
            return result.ok === true && status.state === 'called';
        },
    },

    // -- Teardown --
    {
        name: 'sms: teardown',
        tags: ['integration', 'sms'],
        testFn: async () => { await closeDb(); return true; },
    },
];

void runTests(cases, 'SMS Integration');
