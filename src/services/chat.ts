// ============================================================================
// SKB - Host ↔ diner chat service
// ============================================================================
//
// Thread storage lives in `queue_messages` keyed on (locationId, entryCode).
// Outbound messages are sent synchronously via the existing sendSms() chokepoint
// so the host sees a real delivery status on the row. Inbound messages arrive
// via POST /sms/inbound (see src/routes/sms.ts) and are appended to whichever
// queue_entry currently matches the sender phone on today's service day.
// ============================================================================

import { ObjectId } from 'mongodb';

import { getDb, queueEntries, queueMessages } from '../core/db/mongo.js';
import { getGuestFeatures, getLocation } from './locations.js';
import { sendSms } from './sms.js';
import { serviceDay } from '../core/utils/time.js';
import type { ChatMessage, ChatMessageDTO, ChatThreadDTO } from '../types/chat.js';

const MAX_THREAD_LIMIT = 200;
const DEFAULT_THREAD_LIMIT = 50;

async function assertChatEnabled(locationId: string): Promise<void> {
    const location = await getLocation(locationId);
    if (location && !getGuestFeatures(location).chat) throw new Error('chat.disabled');
}

export interface SendChatResult {
    ok: boolean;
    smsStatus?: 'sent' | 'failed' | 'not_configured';
    message?: ChatMessageDTO;
}

export async function sendChatMessage(
    id: string,
    body: string,
    now: Date = new Date(),
): Promise<SendChatResult> {
    const db = await getDb();
    let _id: ObjectId;
    try { _id = new ObjectId(id); } catch { throw new Error('invalid id'); }
    const entry = await queueEntries(db).findOne({ _id });
    if (!entry) return { ok: false };
    await assertChatEnabled(entry.locationId);
    if (!entry.phone) return { ok: false };

    // TFV 30513: only text diners who explicitly opted in. Non-consenting
    // parties still have a chat thread (stored + visible in the host UI)
    // but the outbound leg doesn't go over SMS — the host must speak to
    // them in person.
    const smsResult = entry.smsConsent === true
        ? await sendSms(entry.phone, body, { locationId: entry.locationId })
        : { successful: false, status: 'not_configured' as const, messageId: '' };
    const msg: ChatMessage = {
        locationId: entry.locationId,
        entryCode: entry.code,
        entryId: id,
        direction: 'outbound',
        body,
        createdAt: now,
        twilioSid: smsResult.messageId || undefined,
        smsStatus: smsResult.successful
            ? 'sent'
            : (smsResult.status === 'not_configured' ? 'not_configured' : 'failed'),
    };
    await queueMessages(db).insertOne(msg);
    return {
        ok: true,
        smsStatus: msg.smsStatus,
        message: { direction: msg.direction, body: msg.body, at: msg.createdAt.toISOString(), smsStatus: msg.smsStatus },
    };
}

export interface GetThreadOptions {
    before?: Date;
    limit?: number;
}

export async function getChatThread(
    id: string,
    opts: GetThreadOptions = {},
): Promise<ChatThreadDTO | null> {
    const db = await getDb();
    let _id: ObjectId;
    try { _id = new ObjectId(id); } catch { throw new Error('invalid id'); }
    const entry = await queueEntries(db).findOne({ _id });
    if (!entry) return null;
    await assertChatEnabled(entry.locationId);
    const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_THREAD_LIMIT), MAX_THREAD_LIMIT);
    const filter: Record<string, unknown> = { locationId: entry.locationId, entryCode: entry.code };
    if (opts.before) filter.createdAt = { $lt: opts.before };
    // Fetch newest batch (limit+1 to decide hasMore), then reverse to oldest→newest
    const docs = await queueMessages(db)
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .toArray();
    const hasMore = docs.length > limit;
    const trimmed = hasMore ? docs.slice(0, limit) : docs;
    const messages: ChatMessageDTO[] = trimmed
        .map((d): ChatMessageDTO => ({
            direction: d.direction,
            body: d.body,
            at: d.createdAt.toISOString(),
            smsStatus: d.smsStatus,
        }))
        .reverse();
    const unread = await queueMessages(db).countDocuments({
        locationId: entry.locationId,
        entryCode: entry.code,
        direction: 'inbound',
        readByHostAt: { $exists: false },
    });
    return { entryId: id, messages, unread, hasMore };
}

export async function markThreadRead(id: string, now: Date = new Date()): Promise<{ updated: number }> {
    const db = await getDb();
    let _id: ObjectId;
    try { _id = new ObjectId(id); } catch { throw new Error('invalid id'); }
    const entry = await queueEntries(db).findOne({ _id });
    if (!entry) return { updated: 0 };
    await assertChatEnabled(entry.locationId);
    const res = await queueMessages(db).updateMany(
        {
            locationId: entry.locationId,
            entryCode: entry.code,
            direction: 'inbound',
            readByHostAt: { $exists: false },
        },
        { $set: { readByHostAt: now } },
    );
    return { updated: res.modifiedCount };
}

const ACTIVE_INBOUND_STATES = ['waiting', 'called', 'seated', 'ordered', 'served', 'checkout'] as const;

export type ResolveInboundOutcome =
    | { kind: 'match'; locationId: string; entryCode: string }
    | { kind: 'none' }
    | { kind: 'collision'; candidateLocationIds: string[] };

/**
 * Tenant-agnostic resolver for inbound SMS on the shared OSH number (#69).
 * Given only the sender's phone and today's service day, find which
 * location's queue the reply belongs to.
 *
 *   - 0 active entries → `{kind: 'none'}` (cold inbound; caller logs and
 *     drops).
 *   - Exactly 1 active entry → `{kind: 'match', locationId, entryCode}`.
 *   - 2+ active entries across different locations → `{kind: 'collision',
 *     candidateLocationIds}`. Caller owns the disambiguation flow (R6 in
 *     spec #69; deferred to a later patch).
 *
 * Each-location duplicate matches collapse to the most recent `joinedAt`
 * — the same location can't collide with itself in the resolver's view.
 */
export async function resolveInboundTenant(
    fromPhone: string,
    today: string,
): Promise<ResolveInboundOutcome> {
    const db = await getDb();
    const normalized = fromPhone.replace(/\D/g, '').replace(/^1/, '').slice(-10);
    if (!normalized) return { kind: 'none' };

    const entries = await queueEntries(db).find(
        {
            serviceDay: today,
            phone: normalized,
            state: { $in: [...ACTIVE_INBOUND_STATES] },
        },
        { sort: { joinedAt: -1 } },
    ).toArray();

    if (entries.length === 0) return { kind: 'none' };

    // Collapse to one entry per location (most recent wins).
    const perLocation = new Map<string, { code: string }>();
    for (const e of entries) {
        if (!perLocation.has(e.locationId)) {
            perLocation.set(e.locationId, { code: e.code });
        }
    }

    if (perLocation.size === 1) {
        const [[locationId, { code }]] = [...perLocation.entries()];
        return { kind: 'match', locationId, entryCode: code };
    }
    return { kind: 'collision', candidateLocationIds: [...perLocation.keys()] };
}

/**
 * Append an inbound SMS to the thread for whichever active/dining party
 * currently matches this phone on today's service day. Unmatched messages are
 * still persisted (with entryCode=null) for audit, but we do NOT open a new
 * thread.
 */
export async function appendInbound(
    locationId: string,
    fromPhone: string,
    body: string,
    twilioSid: string,
    now: Date = new Date(),
): Promise<{ matched: boolean; entryCode: string | null }> {
    const db = await getDb();
    const today = serviceDay(now);
    const normalized = fromPhone.replace(/\D/g, '').replace(/^1/, '').slice(-10);
    const entry = await queueEntries(db).findOne(
        {
            locationId,
            serviceDay: today,
            phone: normalized,
            state: { $in: ['waiting', 'called', 'seated', 'ordered', 'served', 'checkout'] },
        },
        { sort: { joinedAt: -1 } },
    );
    const msg: ChatMessage = {
        locationId,
        entryCode: entry?.code ?? null,
        direction: 'inbound',
        body,
        createdAt: now,
        twilioSid: twilioSid || undefined,
    };
    await queueMessages(db).insertOne(msg);
    return { matched: !!entry, entryCode: entry?.code ?? null };
}

/**
 * Append an inbound chat message from the diner's own web view (queue.html).
 * Parallel to `appendInbound` but keyed on the party code — the diner has
 * their code via their status URL but doesn't know the entry ObjectId.
 *
 * Persists to the same queue_messages thread as SMS inbound so both channels
 * converge on one conversation. No SMS is sent — the host already sees the
 * message in real time when they poll the thread. (Issue #50 bug 1.)
 */
export async function appendInboundFromCode(
    locationId: string,
    code: string,
    body: string,
    now: Date = new Date(),
): Promise<{ ok: boolean; state?: string }> {
    const db = await getDb();
    await assertChatEnabled(locationId);
    const entry = await queueEntries(db).findOne({ locationId, code });
    if (!entry) return { ok: false };
    // Only accept diner-side messages while the party is still live. After
    // `departed` / `no_show` the thread is effectively closed.
    const LIVE_STATES = ['waiting', 'called', 'seated', 'ordered', 'served', 'checkout'];
    if (!LIVE_STATES.includes(entry.state)) {
        return { ok: false, state: entry.state };
    }
    const msg: ChatMessage = {
        locationId,
        entryCode: code,
        direction: 'inbound',
        body,
        createdAt: now,
    };
    await queueMessages(db).insertOne(msg);
    return { ok: true };
}

/**
 * Fetch the chat thread for the diner's own web view by party code. Similar
 * to `getChatThread` but (a) takes a code instead of an entry id and
 * (b) excludes unread counts since the diner doesn't need them.
 */
export async function getChatThreadByCode(
    locationId: string,
    code: string,
    opts: GetThreadOptions = {},
): Promise<ChatThreadDTO | null> {
    const db = await getDb();
    await assertChatEnabled(locationId);
    const entry = await queueEntries(db).findOne({ locationId, code });
    if (!entry) return null;
    const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_THREAD_LIMIT), MAX_THREAD_LIMIT);
    const filter: Record<string, unknown> = { locationId, entryCode: code };
    if (opts.before) filter.createdAt = { $lt: opts.before };
    const docs = await queueMessages(db)
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .toArray();
    const hasMore = docs.length > limit;
    const trimmed = hasMore ? docs.slice(0, limit) : docs;
    const messages: ChatMessageDTO[] = trimmed
        .map((d): ChatMessageDTO => ({
            direction: d.direction,
            body: d.body,
            at: d.createdAt.toISOString(),
            smsStatus: d.smsStatus,
        }))
        .reverse();
    return { entryId: entry._id?.toString() ?? '', messages, unread: 0, hasMore };
}

/**
 * For each code in `codes`, count inbound messages where readByHostAt is
 * missing. One aggregate pass keeps the host list call O(1) round-trips.
 */
export async function countUnreadForEntries(
    locationId: string,
    codes: string[],
): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (codes.length === 0) return out;
    const db = await getDb();
    const agg = await queueMessages(db)
        .aggregate<{ _id: string; count: number }>([
            {
                $match: {
                    locationId,
                    entryCode: { $in: codes },
                    direction: 'inbound',
                    readByHostAt: { $exists: false },
                },
            },
            { $group: { _id: '$entryCode', count: { $sum: 1 } } },
        ])
        .toArray();
    for (const row of agg) {
        out.set(row._id, row.count);
    }
    return out;
}
