// ============================================================================
// SKB - Host ↔ diner chat types
// ============================================================================

import type { ObjectId } from 'mongodb';

export type ChatDirection = 'outbound' | 'inbound';

export interface ChatMessage {
    _id?: ObjectId;
    locationId: string; // tenant slug, e.g. "skb"
    entryCode: string | null; // QueueEntry.code; null for inbound messages we couldn't match
    entryId?: string; // string form of QueueEntry._id at time of write (outbound only)
    direction: ChatDirection;
    body: string; // max 1600 chars (Twilio cap)
    createdAt: Date;
    twilioSid?: string; // outbound: SID; inbound: MessageSid
    smsStatus?: 'sent' | 'failed' | 'not_configured'; // outbound only
    readByHostAt?: Date; // set when host opens the drawer for this entry
}

export interface ChatMessageDTO {
    direction: ChatDirection;
    body: string;
    at: string; // ISO8601
    smsStatus?: string;
}

export interface ChatThreadDTO {
    entryId: string;
    messages: ChatMessageDTO[]; // oldest → newest
    unread: number;
    hasMore: boolean;
}
