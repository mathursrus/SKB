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
import { sendSms } from './sms.js';
import { serviceDay } from '../core/utils/time.js';
import type { ChatMessage, ChatMessageDTO, ChatThreadDTO } from '../types/chat.js';

const MAX_THREAD_LIMIT = 200;
const DEFAULT_THREAD_LIMIT = 50;

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
    if (!entry.phone) return { ok: false };

    const smsResult = await sendSms(entry.phone, body);
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
