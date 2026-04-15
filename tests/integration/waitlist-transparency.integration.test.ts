// ============================================================================
// Integration tests for issue #37 — waitlist transparency, chat, table on seat
// ============================================================================
// Exercises:
//   - getStatusByCode returns the full public waitlist with redacted names
//   - getStatusByCode flips to seated/tableNumber terminal state
//   - removeFromQueue with {tableNumber} persists the table
//   - removeFromQueue with {tableNumber} detects conflict → returns {conflict}
//   - removeFromQueue with override bypasses the conflict
//   - acknowledgeOnMyWay sets onMyWayAt
//   - listHostQueue returns code + unreadChat + phoneForDial + onMyWayAt
//   - chat service: sendChatMessage + appendInbound + unread counts
// ============================================================================

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME = 'skb_37_integration_test';
process.env.FRAIM_BRANCH = '';

import { closeDb, getDb, queueEntries, queueMessages, settings } from '../../src/core/db/mongo.js';
import {
    joinQueue,
    getStatusByCode,
    listHostQueue,
    removeFromQueue,
    acknowledgeOnMyWay,
} from '../../src/services/queue.js';
import {
    sendChatMessage,
    appendInbound,
    getChatThread,
    countUnreadForEntries,
    markThreadRead,
    appendInboundFromCode,
    getChatThreadByCode,
} from '../../src/services/chat.js';
import { advanceParty } from '../../src/services/dining.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await queueMessages(db).deleteMany({});
    await settings(db).deleteMany({});
}

const cases: BaseTestCase[] = [
    // ---------- Public full list (R3) ----------
    {
        name: 'status returns full public queue with redacted names and me-flag on the viewer',
        tags: ['integration', 'queue', 'transparency'],
        testFn: async () => {
            await resetDb();
            const t0 = new Date('2026-04-14T19:00:00Z');
            const a = await joinQueue('test', { name: 'Jae Kim',    partySize: 2, phone: '2065551001' }, new Date(t0.getTime() + 0));
            const b = await joinQueue('test', { name: 'Thao Nguyen',partySize: 5, phone: '2065551002' }, new Date(t0.getTime() + 1000));
            const c = await joinQueue('test', { name: 'Sana Patel', partySize: 4, phone: '2065551003' }, new Date(t0.getTime() + 2000));
            const s = await getStatusByCode(c.code, new Date(t0.getTime() + 3000));
            if (s.totalParties !== 3) return false;
            if (s.queue.length !== 3) return false;
            if (s.queue[0].displayName !== 'Jae K.') return false;
            if (s.queue[1].displayName !== 'Thao N.') return false;
            if (s.queue[2].displayName !== 'Sana P.') return false;
            if (!s.queue[2].isMe) return false;
            if (s.queue[0].isMe) return false;
            if (s.queue[2].position !== 3) return false;
            return s.position === 3;
        },
    },
    {
        name: 'status rate-limit: 429 NOT triggered at the service level (route layer owns the limit)',
        tags: ['integration', 'queue', 'transparency'],
        testFn: async () => {
            // Sanity: the service has no rate limiting; 429 is a route concern.
            await resetDb();
            const r = await joinQueue('test', { name: 'Solo', partySize: 1, phone: '2065552000' });
            const s1 = await getStatusByCode(r.code);
            const s2 = await getStatusByCode(r.code);
            return s1.code === s2.code && s1.state === 'waiting' && s2.state === 'waiting';
        },
    },
    // ---------- Seat → table number (R14, R15, R16) ----------
    {
        name: 'seat with tableNumber persists on QueueEntry and is returned by dining list shape check',
        tags: ['integration', 'queue', 'seat', 'table'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Patel', partySize: 4, phone: '2065551003' });
            const host = await listHostQueue('test');
            const id = host.parties[0].id;
            const result = await removeFromQueue(id, 'seated', { tableNumber: 12 });
            if (!result.ok) return false;
            const db = await getDb();
            const entry = await queueEntries(db).findOne({ code: r.code });
            return entry?.tableNumber === 12 && entry.state === 'seated';
        },
    },
    {
        name: 'seat detects table-number conflict and returns conflict + partyName',
        tags: ['integration', 'queue', 'seat', 'table', 'conflict'],
        testFn: async () => {
            await resetDb();
            const a = await joinQueue('test', { name: 'Kim',   partySize: 2, phone: '2065551001' });
            const b = await joinQueue('test', { name: 'Patel', partySize: 4, phone: '2065551002' });
            const host = await listHostQueue('test');
            await removeFromQueue(host.parties[0].id, 'seated', { tableNumber: 12 });
            const result = await removeFromQueue(host.parties[1].id, 'seated', { tableNumber: 12 });
            if (result.ok) return false;
            if (!result.conflict) return false;
            return result.conflict.partyName === 'Kim';
        },
    },
    {
        name: 'seat with override=true bypasses the conflict scan',
        tags: ['integration', 'queue', 'seat', 'table', 'conflict'],
        testFn: async () => {
            await resetDb();
            const a = await joinQueue('test', { name: 'Kim',   partySize: 2, phone: '2065551001' });
            const b = await joinQueue('test', { name: 'Patel', partySize: 4, phone: '2065551002' });
            const host = await listHostQueue('test');
            await removeFromQueue(host.parties[0].id, 'seated', { tableNumber: 12 });
            const result = await removeFromQueue(host.parties[1].id, 'seated', { tableNumber: 12, override: true });
            return result.ok === true && !result.conflict;
        },
    },
    {
        name: 'legacy seat call (no tableNumber) still works — back-compat',
        tags: ['integration', 'queue', 'seat', 'back-compat'],
        testFn: async () => {
            await resetDb();
            await joinQueue('test', { name: 'Legacy', partySize: 2, phone: '2065551005' });
            const host = await listHostQueue('test');
            const result = await removeFromQueue(host.parties[0].id, 'seated');
            return result.ok === true;
        },
    },
    // ---------- Seated terminal state on status page (R7) ----------
    {
        name: 'status after seat shows state=seated with tableNumber and empty queue',
        tags: ['integration', 'queue', 'transparency', 'seat'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Patel', partySize: 4, phone: '2065551003' });
            const host = await listHostQueue('test');
            await removeFromQueue(host.parties[0].id, 'seated', { tableNumber: 15 });
            const s = await getStatusByCode(r.code);
            return s.state === 'seated' && s.tableNumber === 15 && s.queue.length === 0;
        },
    },
    // ---------- "I'm on my way" (R6) ----------
    {
        name: 'acknowledgeOnMyWay sets onMyWayAt and surfaces on host list',
        tags: ['integration', 'queue', 'ack'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Patel', partySize: 4, phone: '2065551003' });
            const ack = await acknowledgeOnMyWay(r.code);
            if (!ack.ok) return false;
            const host = await listHostQueue('test');
            return typeof host.parties[0].onMyWayAt === 'string' && host.parties[0].onMyWayAt!.length > 0;
        },
    },
    // ---------- Chat (R10) ----------
    {
        name: 'sendChatMessage persists outbound + inbound append updates unread count',
        tags: ['integration', 'queue', 'chat'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Patel', partySize: 4, phone: '2065551003' });
            const host = await listHostQueue('test');
            const id = host.parties[0].id;
            const out = await sendChatMessage(id, 'hello from host');
            if (!out.ok) return false;
            const inb1 = await appendInbound('test', '2065551003', 'hi back', 'SMxxx1');
            const inb2 = await appendInbound('test', '2065551003', 'we are waiting', 'SMxxx2');
            if (!inb1.matched || !inb2.matched) return false;
            const thread = await getChatThread(id);
            if (!thread) return false;
            if (thread.messages.length !== 3) return false;
            if (thread.unread !== 2) return false;
            // mark read zeroes unread
            const read = await markThreadRead(id);
            if (read.updated !== 2) return false;
            const after = await getChatThread(id);
            return after?.unread === 0;
        },
    },
    {
        name: 'countUnreadForEntries aggregates unread across multiple parties in one call',
        tags: ['integration', 'queue', 'chat'],
        testFn: async () => {
            await resetDb();
            const a = await joinQueue('test', { name: 'A', partySize: 2, phone: '2065551010' });
            const b = await joinQueue('test', { name: 'B', partySize: 2, phone: '2065551011' });
            await appendInbound('test', '2065551010', 'msg1', 'SMa1');
            await appendInbound('test', '2065551010', 'msg2', 'SMa2');
            await appendInbound('test', '2065551011', 'msg3', 'SMb1');
            const map = await countUnreadForEntries('test', [a.code, b.code]);
            return map.get(a.code) === 2 && map.get(b.code) === 1;
        },
    },
    {
        name: 'getStatusByCode response never contains any phone/dial key (privacy guard)',
        tags: ['integration', 'queue', 'privacy', 'host-dto'],
        testFn: async () => {
            await resetDb();
            await joinQueue('test', { name: 'Viewer', partySize: 2, phone: '5127753555' });
            const r = await joinQueue('test', { name: 'Other', partySize: 3, phone: '5127759999' });
            const s = await getStatusByCode(r.code);
            const json = JSON.stringify(s);
            // No full phone, no masked display, no E.164, no phoneForDial.
            if (json.includes('5127753555')) return false;
            if (json.includes('5127759999')) return false;
            if (json.includes('phoneForDial')) return false;
            if (json.includes('phoneMasked')) return false;
            if (json.includes('"phone"')) return false;
            return true;
        },
    },
    {
        name: 'appendInbound with no matching phone stores with entryCode=null (audit)',
        tags: ['integration', 'queue', 'chat'],
        testFn: async () => {
            await resetDb();
            const res = await appendInbound('test', '2065559999', 'random msg', 'SMzzz');
            if (res.matched) return false;
            const db = await getDb();
            const doc = await queueMessages(db).findOne({ twilioSid: 'SMzzz' });
            return doc?.entryCode === null && doc?.direction === 'inbound';
        },
    },
    {
        name: 'listHostQueue populates code + phoneForDial + unreadChat on every row',
        tags: ['integration', 'queue', 'host-dto'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Patel', partySize: 4, phone: '2065551003' });
            await appendInbound('test', '2065551003', 'hi', 'SMabc');
            const host = await listHostQueue('test');
            const p = host.parties[0];
            return p.code === r.code
                && p.phoneForDial === '+12065551003'
                && p.unreadChat === 1
                && p.phoneMasked === '******1003';
        },
    },

    // ---------- Issue #50 bug 1: diner chat (by-code) ----------
    {
        name: 'bug50: appendInboundFromCode appends to thread and shows up via host thread',
        tags: ['integration', 'queue', 'chat', 'bug50'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Patel', partySize: 2, phone: '2065551050' });
            const host = await listHostQueue('test');
            const id = host.parties[0].id;
            // Host sends first, then diner replies via web (by-code)
            await sendChatMessage(id, 'Table in 5 minutes');
            const res = await appendInboundFromCode('test', r.code, 'Thanks, on my way');
            if (!res.ok) return false;
            const thread = await getChatThread(id);
            if (!thread) return false;
            if (thread.messages.length !== 2) return false;
            if (thread.messages[0].direction !== 'outbound') return false;
            if (thread.messages[0].body !== 'Table in 5 minutes') return false;
            if (thread.messages[1].direction !== 'inbound') return false;
            if (thread.messages[1].body !== 'Thanks, on my way') return false;
            return true;
        },
    },
    {
        name: 'bug50: getChatThreadByCode returns outbound + inbound in chronological order',
        tags: ['integration', 'queue', 'chat', 'bug50'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Lee', partySize: 3, phone: '2065551051' });
            const host = await listHostQueue('test');
            const id = host.parties[0].id;
            await sendChatMessage(id, 'host msg 1', new Date('2026-04-14T20:00:00Z'));
            await appendInboundFromCode('test', r.code, 'diner msg 1', new Date('2026-04-14T20:01:00Z'));
            await sendChatMessage(id, 'host msg 2', new Date('2026-04-14T20:02:00Z'));
            const thread = await getChatThreadByCode('test', r.code);
            if (!thread) return false;
            if (thread.messages.length !== 3) return false;
            if (thread.messages[0].body !== 'host msg 1') return false;
            if (thread.messages[1].body !== 'diner msg 1') return false;
            if (thread.messages[2].body !== 'host msg 2') return false;
            // Diner thread projection never exposes unread count
            if (thread.unread !== 0) return false;
            return true;
        },
    },
    {
        name: 'bug50: appendInboundFromCode rejects terminal-state entries (departed)',
        tags: ['integration', 'queue', 'chat', 'bug50'],
        testFn: async () => {
            await resetDb();
            const r = await joinQueue('test', { name: 'Done', partySize: 2, phone: '2065551052' });
            const host = await listHostQueue('test');
            const id = host.parties[0].id;
            // Walk the party all the way through to departed
            await removeFromQueue(id, 'seated', { tableNumber: 5 });
            await advanceParty(id, 'ordered');
            await advanceParty(id, 'served');
            await advanceParty(id, 'checkout');
            await advanceParty(id, 'departed');
            const res = await appendInboundFromCode('test', r.code, 'hello?');
            if (res.ok) return false;
            return res.state === 'departed';
        },
    },
    {
        name: 'bug50: appendInboundFromCode returns ok=false for unknown code',
        tags: ['integration', 'queue', 'chat', 'bug50'],
        testFn: async () => {
            await resetDb();
            const res = await appendInboundFromCode('test', 'SKB-ZZZ', 'nobody home');
            return !res.ok;
        },
    },
    {
        name: 'bug50: getChatThreadByCode returns null for unknown code',
        tags: ['integration', 'queue', 'chat', 'bug50'],
        testFn: async () => {
            await resetDb();
            const thread = await getChatThreadByCode('test', 'SKB-ZZZ');
            return thread === null;
        },
    },
];

async function main(): Promise<void> {
    try {
        await runTests(cases, 'Waitlist Transparency Integration');
    } finally {
        await closeDb();
    }
}

void main();
