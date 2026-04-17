// ============================================================================
// SKB MCP tools — Seated tab (dining lifecycle, advance state, timeline)
// ============================================================================

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { advanceParty, getPartyTimeline, listDiningParties } from '../../services/dining.js';
import type { McpAuthContext } from '../auth.js';

function ok(data: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
    return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

const partyIdSchema = z.string().regex(/^[a-f0-9]{24}$/, 'must be a 24-char hex ObjectId');

export function registerSeatedTools(server: McpServer, getCtx: () => McpAuthContext): void {
    server.tool(
        'list_seated',
        "List parties currently dining (seated / ordered / served / checkout). Each row carries its state-transition timings.",
        z.object({}).shape,
        async () => {
            const ctx = getCtx();
            const result = await listDiningParties(ctx.locationId);
            return ok(result);
        },
    );

    server.tool(
        'advance_party',
        "Advance a dining party to the next state. Valid forward order: seated → ordered → served → checkout → departed. Backward transitions are rejected; skipping states is allowed (e.g. seated → departed for a walkaway).",
        z.object({
            id: partyIdSchema,
            state: z.enum(['ordered', 'served', 'checkout', 'departed']),
        }).shape,
        async ({ id, state }) => {
            try {
                const result = await advanceParty(id, state);
                return ok(result);
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );

    server.tool(
        'get_party_timeline',
        "Fetch the full state-transition timestamp history for a single party (joined, called, seated, ordered, served, checkout, departed). Useful for debugging slow turns.",
        z.object({ id: partyIdSchema }).shape,
        async ({ id }) => {
            try {
                const result = await getPartyTimeline(id);
                if (!result) return err(`no party found for id ${id}`);
                return ok(result);
            } catch (e) {
                return err((e as Error).message);
            }
        },
    );
}
