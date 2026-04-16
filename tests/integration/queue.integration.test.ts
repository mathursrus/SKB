// Integration tests for queue service against real MongoDB.
// Covers: join, remove, call/recall, position recompute, promised-time stability, EOD filter.

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_queue_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, settings } from '../../src/core/db/mongo.js';
import {
    getQueueState,
    joinQueue,
    getStatusByCode,
    listHostQueue,
    removeFromQueue,
    callParty,
} from '../../src/services/queue.js';
import {
    advanceParty,
    getPartyTimeline,
    listCompletedParties,
    listDiningParties,
} from '../../src/services/dining.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await settings(db).deleteMany({});
}

const cases: BaseTestCase[] = [
    {
        name: 'join: empty queue → position 1, promised ETA = now + avg_turn_time',
        tags: ['integration', 'queue', 'join', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Alice', partySize: 2, phone: '2065551234' }, new Date('2026-04-05T20:00:00Z'));
            return r.position === 1 && r.etaMinutes === 8 && r.etaAt === '2026-04-05T20:08:00.000Z' && /^SKB-[A-Z2-9]{3}$/.test(r.code);
        },
    },
    {
        name: 'join 3 parties: positions increment; each has fixed promisedEtaAt',
        tags: ['integration', 'queue', 'join', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const base = new Date('2026-04-05T20:00:00Z').getTime();
            const r1 = await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551234' }, new Date(base));
            const r2 = await joinQueue('test', { name: 'B', partySize: 3, phone: '2065551235' }, new Date(base + 1000));
            const r3 = await joinQueue('test', { name: 'C', partySize: 4, phone: '2065551236' }, new Date(base + 2000));
            return r1.position === 1 && r2.position === 2 && r3.position === 3 &&
                r1.etaMinutes === 8 && r2.etaMinutes === 16 && r3.etaMinutes === 24;
        },
    },
    {
        name: 'status: promised time never changes; live etaMinutes reflects current position',
        tags: ['integration', 'queue', 'status', 'promised-time', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const join = await joinQueue('test', { name: 'Diner', partySize: 2, phone: '2065551234' }, t0);
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            const s5 = await getStatusByCode(join.code, t5);
            const t20 = new Date(t0.getTime() + 20 * 60_000);
            const s20 = await getStatusByCode(join.code, t20);
            return s5.etaAt === join.etaAt && s20.etaAt === join.etaAt && s5.etaMinutes === 8;
        },
    },
    {
        name: 'remove: positions recompute for remaining parties (AC-R6/R7)',
        tags: ['integration', 'queue', 'remove', 'eta', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j1 = await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551234' }, new Date(t0.getTime()));
            await joinQueue('test', { name: 'B', partySize: 2, phone: '2065551235' }, new Date(t0.getTime() + 1000));
            const j3 = await joinQueue('test', { name: 'C', partySize: 2, phone: '2065551236' }, new Date(t0.getTime() + 2000));
            const list = await listHostQueue('test', t0);
            const bId = list.parties.find(p => p.name === 'B')!.id;
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await removeFromQueue(bId, 'seated', t5);
            const cStatus = await getStatusByCode(j3.code, t5);
            const aStatus = await getStatusByCode(j1.code, t5);
            return cStatus.position === 2 && cStatus.etaMinutes === 16 && cStatus.etaAt === j3.etaAt &&
                aStatus.position === 1 && aStatus.etaAt === j1.etaAt;
        },
    },
    {
        name: 'callParty: state → called; calls array appends; callsMinutesAgo returned',
        tags: ['integration', 'queue', 'call', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j = await joinQueue('test', { name: 'X', partySize: 2, phone: '2065551234' }, t0);
            const list = await listHostQueue('test', t0);
            const id = list.parties[0].id;
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await callParty(id, t5);
            const s1 = await getStatusByCode(j.code, t5);
            const t8 = new Date(t0.getTime() + 8 * 60_000);
            await callParty(id, t8);
            const s2 = await getStatusByCode(j.code, t8);
            const t12 = new Date(t0.getTime() + 12 * 60_000);
            const s3 = await getStatusByCode(j.code, t12);
            return s1.state === 'called' && s1.callsMinutesAgo.length === 1 &&
                s2.callsMinutesAgo.length === 2 && s2.callsMinutesAgo[0] === 3 &&
                s3.callsMinutesAgo[0] === 7 && s3.callsMinutesAgo[1] === 4;
        },
    },
    {
        name: 'called party still counts toward queue length and position',
        tags: ['integration', 'queue', 'call', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551234' }, new Date(t0.getTime()));
            const j2 = await joinQueue('test', { name: 'B', partySize: 2, phone: '2065551235' }, new Date(t0.getTime() + 1000));
            const list = await listHostQueue('test', t0);
            await callParty(list.parties[0].id, t0);
            const bStatus = await getStatusByCode(j2.code, t0);
            const state = await getQueueState('test', t0);
            return bStatus.position === 2 && state.partiesWaiting === 2;
        },
    },
    {
        name: 'remove called party is allowed',
        tags: ['integration', 'queue', 'call', 'remove', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j = await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551234' }, t0);
            const list = await listHostQueue('test', t0);
            await callParty(list.parties[0].id, t0);
            const result = await removeFromQueue(list.parties[0].id, 'seated', new Date(t0.getTime() + 1000));
            const status = await getStatusByCode(j.code, new Date(t0.getTime() + 2000));
            return result.ok && status.state === 'seated';
        },
    },
    {
        name: 'status for unknown code returns not_found',
        tags: ['integration', 'queue', 'status'],
        testFn: async () => {
            await resetDb();
            const status = await getStatusByCode('SKB-ZZZ');
            return status.state === 'not_found' && status.position === 0;
        },
    },
    {
        name: 'getQueueState: etaForNewPartyMinutes = (waiting+1) × avg',
        tags: ['integration', 'queue', 'state', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551234' }, t0);
            await joinQueue('test', { name: 'B', partySize: 2, phone: '2065551235' }, new Date(t0.getTime() + 1));
            const s = await getQueueState('test', t0);
            return s.partiesWaiting === 2 && s.etaForNewPartyMinutes === 24;
        },
    },
    {
        name: 'listHostQueue returns parties with state and call history',
        tags: ['integration', 'queue', 'host-queue', 'call'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551234' }, t0);
            await joinQueue('test', { name: 'B', partySize: 2, phone: '2065551235' }, new Date(t0.getTime() + 1));
            const list0 = await listHostQueue('test', t0);
            if (list0.parties[0].state !== 'waiting' || list0.parties[0].calls.length !== 0) return false;
            const aId = list0.parties[0].id;
            await callParty(aId, t0);
            const t3 = new Date(t0.getTime() + 3 * 60_000);
            await callParty(aId, t3);
            const list1 = await listHostQueue('test', t3);
            const a = list1.parties.find(p => p.name === 'A')!;
            return a.state === 'called' && a.calls.length === 2 &&
                a.calls[0].minutesAgo === 3 && a.calls[1].minutesAgo === 0;
        },
    },
    // -- Dining lifecycle (issue #24) ------------------------------------------
    {
        name: 'seated: party moves to dining, seatedAt set, removedAt NOT set (R12)',
        tags: ['integration', 'queue', 'lifecycle', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j = await joinQueue('test', { name: 'Diner', partySize: 2, phone: '2065551234' }, t0);
            const list = await listHostQueue('test', t0);
            const id = list.parties[0].id;
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await removeFromQueue(id, 'seated', t5);
            // Check dining list
            const dining = await listDiningParties('test', t5);
            if (dining.parties.length !== 1) return false;
            if (dining.parties[0].state !== 'seated') return false;
            // Check status: should be 'seated'
            const status = await getStatusByCode(j.code, t5);
            if (status.state !== 'seated') return false;
            // Check that party is NOT in the queue anymore
            const queue = await listHostQueue('test', t5);
            return queue.parties.length === 0;
        },
    },
    {
        name: 'advance: seated→ordered→served→checkout→departed full lifecycle (AC-R1/R2)',
        tags: ['integration', 'queue', 'lifecycle', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'Full', partySize: 3, phone: '2065551234' }, t0);
            const list = await listHostQueue('test', t0);
            const id = list.parties[0].id;
            // Seat
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await removeFromQueue(id, 'seated', t5);
            // Ordered
            const t15 = new Date(t0.getTime() + 15 * 60_000);
            const r1 = await advanceParty(id, 'ordered', t15);
            if (!r1.ok) return false;
            // Served
            const t30 = new Date(t0.getTime() + 30 * 60_000);
            const r2 = await advanceParty(id, 'served', t30);
            if (!r2.ok) return false;
            // Checkout
            const t45 = new Date(t0.getTime() + 45 * 60_000);
            const r3 = await advanceParty(id, 'checkout', t45);
            if (!r3.ok) return false;
            // Departed
            const t50 = new Date(t0.getTime() + 50 * 60_000);
            const r4 = await advanceParty(id, 'departed', t50);
            if (!r4.ok) return false;
            // Should be in completed list
            const completed = await listCompletedParties('test', t50);
            if (completed.parties.length !== 1) return false;
            if (completed.parties[0].state !== 'departed') return false;
            // Dining should be empty
            const dining = await listDiningParties('test', t50);
            return dining.parties.length === 0;
        },
    },
    {
        name: 'advance: skip states — seated directly to departed (AC-R5)',
        tags: ['integration', 'queue', 'lifecycle'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'Skip', partySize: 2, phone: '2065551234' }, t0);
            const list = await listHostQueue('test', t0);
            const id = list.parties[0].id;
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await removeFromQueue(id, 'seated', t5);
            const t10 = new Date(t0.getTime() + 10 * 60_000);
            const r = await advanceParty(id, 'departed', t10);
            if (!r.ok) return false;
            // Timeline: only joinedAt, seatedAt, departedAt should be set
            const timeline = await getPartyTimeline(id);
            if (!timeline) return false;
            return (
                timeline.timestamps.seatedAt !== null &&
                timeline.timestamps.departedAt !== null &&
                timeline.timestamps.orderedAt === null &&
                timeline.timestamps.servedAt === null &&
                timeline.timestamps.checkoutAt === null
            );
        },
    },
    {
        name: 'advance: backward transition rejected (400 equivalent)',
        tags: ['integration', 'queue', 'lifecycle'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'Back', partySize: 2, phone: '2065551234' }, t0);
            const list = await listHostQueue('test', t0);
            const id = list.parties[0].id;
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await removeFromQueue(id, 'seated', t5);
            const t10 = new Date(t0.getTime() + 10 * 60_000);
            await advanceParty(id, 'served', t10); // skip ordered
            try {
                await advanceParty(id, 'ordered'); // backward — should throw
                return false; // should not reach here
            } catch (err) {
                return err instanceof Error && err.message.includes('cannot advance backward');
            }
        },
    },
    {
        name: 'advance: invalid target state rejected',
        tags: ['integration', 'queue', 'lifecycle'],
        testFn: async () => {
            await resetDb();
            try {
                await advanceParty('000000000000000000000000', 'flying');
                return false;
            } catch (err) {
                return err instanceof Error && err.message.includes('invalid target state');
            }
        },
    },
    {
        name: 'listDiningParties: shows parties in seated/ordered/served/checkout',
        tags: ['integration', 'queue', 'lifecycle'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            // Create 3 parties in different dining states
            await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551234' }, new Date(t0.getTime()));
            await joinQueue('test', { name: 'B', partySize: 3, phone: '2065551235' }, new Date(t0.getTime() + 1000));
            await joinQueue('test', { name: 'C', partySize: 4, phone: '2065551236' }, new Date(t0.getTime() + 2000));
            const list = await listHostQueue('test', t0);
            const aId = list.parties[0].id;
            const bId = list.parties[1].id;
            const cId = list.parties[2].id;
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await removeFromQueue(aId, 'seated', t5);
            await removeFromQueue(bId, 'seated', t5);
            await removeFromQueue(cId, 'seated', t5);
            const t10 = new Date(t0.getTime() + 10 * 60_000);
            await advanceParty(bId, 'ordered', t10);
            await advanceParty(cId, 'served', t10);
            const dining = await listDiningParties('test', t10);
            if (dining.diningCount !== 3) return false;
            const states = dining.parties.map(p => p.state).sort();
            return states[0] === 'ordered' && states[1] === 'seated' && states[2] === 'served';
        },
    },
    {
        name: 'getPartyTimeline: returns full timeline (AC-R10)',
        tags: ['integration', 'queue', 'lifecycle'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j = await joinQueue('test', { name: 'Timeline', partySize: 2, phone: '2065551234' }, t0);
            const list = await listHostQueue('test', t0);
            const id = list.parties[0].id;
            const t3 = new Date(t0.getTime() + 3 * 60_000);
            await callParty(id, t3);
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            await removeFromQueue(id, 'seated', t5);
            const t15 = new Date(t0.getTime() + 15 * 60_000);
            await advanceParty(id, 'ordered', t15);
            const timeline = await getPartyTimeline(id);
            if (!timeline) return false;
            return (
                timeline.name === 'Timeline' &&
                timeline.state === 'ordered' &&
                timeline.timestamps.joinedAt !== null &&
                timeline.timestamps.calledAt !== null &&
                timeline.timestamps.seatedAt !== null &&
                timeline.timestamps.orderedAt !== null &&
                timeline.timestamps.servedAt === null
            );
        },
    },
    {
        name: 'no-show still works unchanged (R12 backward compat)',
        tags: ['integration', 'queue', 'lifecycle', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            const j = await joinQueue('test', { name: 'NoShow', partySize: 2, phone: '2065551234' }, t0);
            const list = await listHostQueue('test', t0);
            const id = list.parties[0].id;
            const t10 = new Date(t0.getTime() + 10 * 60_000);
            await removeFromQueue(id, 'no_show', t10);
            const status = await getStatusByCode(j.code, t10);
            if (status.state !== 'no_show') return false;
            const completed = await listCompletedParties('test', t10);
            return completed.totalNoShows === 1 && completed.totalServed === 0;
        },
    },
    // ---------- TFV 30513: SMS consent is optional, not a prereq ----------
    // Diners who don't opt in still join but receive NO SMS. The opt-in
    // flag propagates from join → queue entry → callParty → sendChatMessage.
    {
        name: 'join: smsConsent=true is persisted on the queue entry',
        tags: ['integration', 'queue', 'sms-consent'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'OptIn', partySize: 2, phone: '2065551234', smsConsent: true }, t0);
            const db = await getDb();
            const doc = await queueEntries(db).findOne({ name: 'OptIn' });
            return doc?.smsConsent === true;
        },
    },
    {
        name: 'join: smsConsent=false is persisted on the queue entry',
        tags: ['integration', 'queue', 'sms-consent'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'NoSms', partySize: 2, phone: '2065551234', smsConsent: false }, t0);
            const db = await getDb();
            const doc = await queueEntries(db).findOne({ name: 'NoSms' });
            return doc?.smsConsent === false;
        },
    },
    {
        name: 'join: smsConsent defaults to false when omitted (safe-by-default)',
        tags: ['integration', 'queue', 'sms-consent'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            // Note: callers that don't set smsConsent get false — required
            // for TFV 30513 (consent must be explicit + opt-in).
            await joinQueue('test', { name: 'Default', partySize: 2, phone: '2065551234' }, t0);
            const db = await getDb();
            const doc = await queueEntries(db).findOne({ name: 'Default' });
            return doc?.smsConsent === false;
        },
    },
    {
        name: 'callParty: non-consenting diner → state flips to called, smsStatus=not_configured',
        tags: ['integration', 'queue', 'call', 'sms-consent', 'waitlist-path'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-05T20:00:00Z');
            await joinQueue('test', { name: 'NoSms', partySize: 2, phone: '2065551234', smsConsent: false }, t0);
            const list = await listHostQueue('test', t0);
            const id = list.parties[0]?.id ?? '';
            const t5 = new Date(t0.getTime() + 5 * 60_000);
            const result = await callParty(id, t5);
            const db = await getDb();
            const doc = await queueEntries(db).findOne({ name: 'NoSms' });
            // State still advances (host needs the "called" marker even without SMS)
            // but smsStatus reports not_configured so the host knows the text didn't go
            return result.ok === true
                && result.smsStatus === 'not_configured'
                && doc?.state === 'called'
                && (doc?.calls?.[0]?.smsStatus === 'not_configured');
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'queue'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'queue (integration)');
