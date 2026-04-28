// Integration tests for src/services/chat.ts — sendChatMessage, getChatThread,
// markThreadRead, appendInbound, appendInboundFromCode, getChatThreadByCode,
// countUnreadForEntries. Uses real MongoDB (seeded per-test). No HTTP server.
//
// Covers the TFV 30513 invariant that non-consenting diners still get their
// chat messages persisted but never see an SMS leg (smsStatus = not_configured).

import { runTests, type BaseTestCase } from '../test-utils.js';

process.env.MONGODB_DB_NAME ??= 'skb_chat_integration_test';
process.env.FRAIM_BRANCH ??= '';

// Force the SMS path into not_configured so we can assert the consent gate
// deterministically (no real Twilio calls).
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_PHONE_NUMBER;

import { closeDb, getDb, queueEntries, queueMessages, locations } from '../../src/core/db/mongo.js';
import {
    sendChatMessage,
    getChatThread,
    markThreadRead,
    appendInbound,
    appendInboundFromCode,
    getChatThreadByCode,
    countUnreadForEntries,
} from '../../src/services/chat.js';
import { joinQueue } from '../../src/services/queue.js';
import { ensureLocation, updateLocationGuestFeatures } from '../../src/services/locations.js';

async function resetDb(): Promise<void> {
    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await queueMessages(db).deleteMany({});
    // Reset features.chat to default-on between cases. The "features.chat=false"
    // tests below explicitly flip it; without this reset the next case would
    // inherit the disabled flag.
    await locations(db).updateOne(
        { _id: 'test' },
        { $unset: { guestFeatures: '' } },
    );
}

async function seedConsenting(): Promise<{ id: string; code: string }> {
    await resetDb();
    const r = await joinQueue('test', { name: 'OptIn', partySize: 2, phone: '2065551234', smsConsent: true });
    const db = await getDb();
    const doc = await queueEntries(db).findOne({ code: r.code });
    return { id: String(doc?._id ?? ''), code: r.code };
}

async function seedNonConsenting(): Promise<{ id: string; code: string }> {
    await resetDb();
    const r = await joinQueue('test', { name: 'NoSms', partySize: 2, phone: '2065551235', smsConsent: false });
    const db = await getDb();
    const doc = await queueEntries(db).findOne({ code: r.code });
    return { id: String(doc?._id ?? ''), code: r.code };
}

const cases: BaseTestCase[] = [
    {
        name: 'sendChatMessage: invalid ObjectId throws',
        tags: ['integration', 'chat', 'validation'],
        testFn: async () => {
            try {
                await sendChatMessage('not-an-objectid', 'hi');
                return false;
            } catch (err) {
                return (err as Error).message === 'invalid id';
            }
        },
    },
    {
        name: 'sendChatMessage: missing entry returns ok:false',
        tags: ['integration', 'chat'],
        testFn: async () => {
            await resetDb();
            const fakeId = '507f1f77bcf86cd799439011'; // valid ObjectId format, not in DB
            const r = await sendChatMessage(fakeId, 'hi');
            return r.ok === false;
        },
    },
    {
        name: 'sendChatMessage: non-consenting party still persists outbound message, no SMS',
        tags: ['integration', 'chat', 'sms-consent'],
        testFn: async () => {
            const { id, code } = await seedNonConsenting();
            const r = await sendChatMessage(id, 'Your table is ready!');
            const db = await getDb();
            const messages = await queueMessages(db).find({ entryCode: code }).toArray();
            return r.ok === true
                && r.smsStatus === 'not_configured'
                && messages.length === 1
                && messages[0]?.direction === 'outbound'
                && messages[0]?.body === 'Your table is ready!';
        },
    },
    {
        name: 'getChatThread: returns persisted messages in oldest→newest order',
        tags: ['integration', 'chat'],
        testFn: async () => {
            const { id } = await seedNonConsenting();
            await sendChatMessage(id, 'first');
            await new Promise((res) => setTimeout(res, 5));
            await sendChatMessage(id, 'second');
            const thread = await getChatThread(id);
            return !!thread
                && thread.messages.length === 2
                && thread.messages[0]?.body === 'first'
                && thread.messages[1]?.body === 'second';
        },
    },
    {
        name: 'getChatThread: null for invalid ObjectId',
        tags: ['integration', 'chat', 'validation'],
        testFn: async () => {
            try {
                await getChatThread('bad-id');
                return false;
            } catch (err) {
                return (err as Error).message === 'invalid id';
            }
        },
    },
    {
        name: 'getChatThread: null for missing entry',
        tags: ['integration', 'chat'],
        testFn: async () => {
            await resetDb();
            const r = await getChatThread('507f1f77bcf86cd799439011');
            return r === null;
        },
    },
    {
        name: 'appendInbound: stores inbound keyed to matching party on today\'s service day',
        tags: ['integration', 'chat', 'inbound'],
        testFn: async () => {
            const { id, code } = await seedNonConsenting();
            const r = await appendInbound('test', '+12065551235', 'I will be there in 5', 'SMabc123');
            const thread = await getChatThread(id);
            return r.matched === true
                && r.entryCode === code
                && !!thread
                && thread.messages.some((m) => m.direction === 'inbound' && m.body.includes('5'));
        },
    },
    {
        name: 'appendInbound: unmatched phone still persists with entryCode=null (audit)',
        tags: ['integration', 'chat', 'inbound'],
        testFn: async () => {
            await resetDb();
            const r = await appendInbound('test', '+15555551111', 'stray sms', 'SMstray');
            const db = await getDb();
            const doc = await queueMessages(db).findOne({ twilioSid: 'SMstray' });
            return r.matched === false
                && r.entryCode === null
                && !!doc
                && doc.entryCode === null;
        },
    },
    {
        name: 'markThreadRead: sets readByHostAt on inbound messages and reports updated count',
        tags: ['integration', 'chat'],
        testFn: async () => {
            const { id } = await seedNonConsenting();
            await appendInbound('test', '+12065551235', 'one', 'SMone');
            await appendInbound('test', '+12065551235', 'two', 'SMtwo');
            const res = await markThreadRead(id);
            const thread = await getChatThread(id);
            return res.updated === 2 && thread?.unread === 0;
        },
    },
    {
        name: 'markThreadRead: invalid id throws',
        tags: ['integration', 'chat', 'validation'],
        testFn: async () => {
            try { await markThreadRead('nope'); return false; }
            catch (err) { return (err as Error).message === 'invalid id'; }
        },
    },
    {
        name: 'markThreadRead: missing entry returns 0',
        tags: ['integration', 'chat'],
        testFn: async () => {
            await resetDb();
            const r = await markThreadRead('507f1f77bcf86cd799439011');
            return r.updated === 0;
        },
    },
    {
        name: 'appendInboundFromCode: live state accepts the message',
        tags: ['integration', 'chat', 'diner-side'],
        testFn: async () => {
            const { code } = await seedNonConsenting();
            const r = await appendInboundFromCode('test', code, 'thanks!');
            return r.ok === true;
        },
    },
    {
        name: 'appendInboundFromCode: unknown code returns ok:false',
        tags: ['integration', 'chat', 'diner-side'],
        testFn: async () => {
            await resetDb();
            const r = await appendInboundFromCode('test', 'SKB-NOPE', 'hi');
            return r.ok === false;
        },
    },
    {
        name: 'appendInboundFromCode: rejects once the party has departed',
        tags: ['integration', 'chat', 'diner-side'],
        testFn: async () => {
            const { code } = await seedNonConsenting();
            const db = await getDb();
            await queueEntries(db).updateOne({ code }, { $set: { state: 'departed' } });
            const r = await appendInboundFromCode('test', code, 'too late');
            return r.ok === false && r.state === 'departed';
        },
    },
    {
        name: 'getChatThreadByCode: returns thread without unread count',
        tags: ['integration', 'chat', 'diner-side'],
        testFn: async () => {
            const { code, id } = await seedNonConsenting();
            await sendChatMessage(id, 'host says hi');
            const thread = await getChatThreadByCode('test', code);
            return !!thread
                && thread.messages.length === 1
                && thread.messages[0]?.body === 'host says hi'
                && thread.unread === 0;
        },
    },
    {
        name: 'getChatThreadByCode: null for unknown code',
        tags: ['integration', 'chat', 'diner-side'],
        testFn: async () => {
            await resetDb();
            const r = await getChatThreadByCode('test', 'SKB-XXX');
            return r === null;
        },
    },
    {
        name: 'countUnreadForEntries: aggregates per-code unread counts',
        tags: ['integration', 'chat', 'unread'],
        testFn: async () => {
            const { code } = await seedNonConsenting();
            await appendInbound('test', '+12065551235', 'a', 'SMa');
            await appendInbound('test', '+12065551235', 'b', 'SMb');
            const map = await countUnreadForEntries('test', [code, 'SKB-NONE']);
            return map.get(code) === 2 && !map.has('SKB-NONE');
        },
    },
    {
        name: 'countUnreadForEntries: empty codes array short-circuits',
        tags: ['integration', 'chat', 'unread'],
        testFn: async () => {
            const map = await countUnreadForEntries('test', []);
            return map.size === 0;
        },
    },
    // ---------- features.chat=false: host-side ops keep working ----------
    // features.chat now ONLY gates the diner-side queue.html panel. The host
    // must still be able to message SMS-consenting diners and see the audit
    // thread, regardless of whether the diner gets a web chat surface.
    {
        name: 'features.chat=false: sendChatMessage still persists outbound and sends SMS to consenting diner',
        tags: ['integration', 'chat', 'features-chat', 'host-surface'],
        testFn: async () => {
            await resetDb();
            await ensureLocation('test', 'Test Restaurant', '1234');
            await updateLocationGuestFeatures('test', { chat: false });
            const r = await joinQueue('test', { name: 'OptIn', partySize: 2, phone: '2065551240', smsConsent: true });
            const db = await getDb();
            const doc = await queueEntries(db).findOne({ code: r.code });
            const id = String(doc?._id ?? '');
            const send = await sendChatMessage(id, 'See you in 5');
            const msgs = await queueMessages(db).find({ entryCode: r.code }).toArray();
            return send.ok === true
                && msgs.length === 1
                && msgs[0]?.direction === 'outbound'
                && msgs[0]?.body === 'See you in 5';
        },
    },
    {
        name: 'features.chat=false: getChatThread still returns the host\'s thread',
        tags: ['integration', 'chat', 'features-chat', 'host-surface'],
        testFn: async () => {
            await resetDb();
            await ensureLocation('test', 'Test Restaurant', '1234');
            await updateLocationGuestFeatures('test', { chat: false });
            const r = await joinQueue('test', { name: 'NoPanel', partySize: 2, phone: '2065551241', smsConsent: false });
            const db = await getDb();
            const doc = await queueEntries(db).findOne({ code: r.code });
            const id = String(doc?._id ?? '');
            await sendChatMessage(id, 'audit-only');
            const thread = await getChatThread(id);
            return !!thread
                && thread.messages.length === 1
                && thread.messages[0]?.body === 'audit-only';
        },
    },
    {
        name: 'features.chat=false: markThreadRead still updates the host\'s unread state',
        tags: ['integration', 'chat', 'features-chat', 'host-surface'],
        testFn: async () => {
            await resetDb();
            await ensureLocation('test', 'Test Restaurant', '1234');
            await updateLocationGuestFeatures('test', { chat: false });
            const r = await joinQueue('test', { name: 'Inbox', partySize: 2, phone: '2065551242', smsConsent: false });
            const db = await getDb();
            const doc = await queueEntries(db).findOne({ code: r.code });
            const id = String(doc?._id ?? '');
            await appendInbound('test', '+12065551242', 'reply', 'SMtfck');
            const res = await markThreadRead(id);
            const thread = await getChatThread(id);
            return res.updated === 1 && thread?.unread === 0;
        },
    },
    {
        name: 'features.chat=false: getChatThreadByCode (diner surface) STILL rejects with chat.disabled',
        tags: ['integration', 'chat', 'features-chat', 'diner-side'],
        testFn: async () => {
            await resetDb();
            await ensureLocation('test', 'Test Restaurant', '1234');
            await updateLocationGuestFeatures('test', { chat: false });
            const r = await joinQueue('test', { name: 'Diner', partySize: 2, phone: '2065551243', smsConsent: true });
            try {
                await getChatThreadByCode('test', r.code);
                return false;
            } catch (err) {
                return (err as Error).message === 'chat.disabled';
            }
        },
    },
    {
        name: 'features.chat=false: appendInboundFromCode (diner surface) STILL rejects with chat.disabled',
        tags: ['integration', 'chat', 'features-chat', 'diner-side'],
        testFn: async () => {
            await resetDb();
            await ensureLocation('test', 'Test Restaurant', '1234');
            await updateLocationGuestFeatures('test', { chat: false });
            const r = await joinQueue('test', { name: 'Diner', partySize: 2, phone: '2065551244', smsConsent: true });
            try {
                await appendInboundFromCode('test', r.code, 'hi');
                return false;
            } catch (err) {
                return (err as Error).message === 'chat.disabled';
            }
        },
    },
    {
        name: 'teardown',
        tags: ['integration', 'chat'],
        testFn: async () => { await resetDb(); await closeDb(); return true; },
    },
];

void runTests(cases, 'chat (integration)');
