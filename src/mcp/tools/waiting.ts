// ============================================================================
// SKB MCP tools — Waiting tab (join, seat, notify, chat, no-show)
// ============================================================================
//
// All handlers call the service layer directly instead of re-entering HTTP;
// we're in the same process as the Express app so there's no benefit to
// round-tripping. Location scope comes from the MCP auth context on every
// tool call.
// ============================================================================

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
    callParty,
    joinQueue,
    listHostQueue,
    removeFromQueue,
} from '../../services/queue.js';
import {
    sendChatMessage,
    getChatThread,
    markThreadRead,
} from '../../services/chat.js';
import type { McpAuthContext } from '../auth.js';

/** Wrap tool output for the MCP `content` envelope. */
function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
    return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

const partyIdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'must be a 24-char hex ObjectId');

export function registerWaitingTools(server: McpServer, getCtx: () => McpAuthContext): void {
    server.tool(
        'list_waiting',
        "List parties currently waiting (or called). Equivalent to the host Waiting tab.",
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const result = await listHostQueue(ctx.locationId);
            return ok(result);
        },
    );

    server.tool(
        'add_party',
        "Add a walk-in to the waitlist. Name, partySize 1-10, 10-digit phone. smsConsent defaults to true since the host has verbal consent from an in-person ask.",
        z.object({
            name: z.string().min(1).max(60),
            partySize: z.number().int().min(1).max(10),
            phone: z.string().regex(/^\d{10}$/, 'exactly 10 digits'),
            smsConsent: z.boolean().optional(),
        }).shape,
        async ({ name, partySize, phone, smsConsent }) => {
            if (/[<>\\]/.test(name)) return err('name contains unsupported characters');
            const ctx = getCtx();
            const result = await joinQueue(ctx.locationId, {
                name: name.trim(),
                partySize,
                phone,
                smsConsent: smsConsent !== false,
            });
            return ok(result);
        },
    );

    server.tool(
        'seat_party',
        "Seat a waiting party at a specific table. Returns {ok:true} on success, or {ok:false, conflict} if the table is already occupied by another dining party (use override=true to force).",
        z.object({
            id: partyIdSchema,
            tableNumber: z.number().int().min(1).max(999),
            override: z.boolean().optional(),
        }).shape,
        async ({ id, tableNumber, override }) => {
            const result = await removeFromQueue(id, 'seated', { tableNumber, override: override === true });
            return ok(result);
        },
    );

    server.tool(
        'mark_no_show',
        "Remove a waiting party as a no-show. State becomes no_show; they'll appear in the Complete tab's retrospective.",
        z.object({ id: partyIdSchema }).shape,
        async ({ id }) => {
            const result = await removeFromQueue(id, 'no_show');
            return ok(result);
        },
    );

    server.tool(
        'notify_party',
        "Send a server-side SMS telling the party their table is ready (or a re-notify if already called). Only sends if the diner opted in (smsConsent=true). Returns {ok, smsStatus}.",
        z.object({ id: partyIdSchema }).shape,
        async ({ id }) => {
            const result = await callParty(id);
            return ok(result);
        },
    );

    server.tool(
        'send_chat',
        "Send an outbound chat message to a party. Persists to the thread AND sends SMS if they opted in. Use this for one-off messages; read_chat to see replies.",
        z.object({
            id: partyIdSchema,
            body: z.string().min(1).max(1600),
        }).shape,
        async ({ id, body }) => {
            const result = await sendChatMessage(id, body);
            return ok(result);
        },
    );

    server.tool(
        'read_chat',
        "Fetch the full chat thread for a party (oldest → newest). Returns {entryId, messages[], unread, hasMore}.",
        z.object({
            id: partyIdSchema,
            limit: z.number().int().min(1).max(200).optional(),
        }).shape,
        async ({ id, limit }) => {
            const result = await getChatThread(id, { limit });
            if (!result) return err(`no party found for id ${id}`);
            return ok(result);
        },
    );

    server.tool(
        'mark_chat_read',
        "Mark all inbound chat messages for a party as read by the host. Returns {updated:N}.",
        z.object({ id: partyIdSchema }).shape,
        async ({ id }) => {
            const result = await markThreadRead(id);
            return ok(result);
        },
    );
}
