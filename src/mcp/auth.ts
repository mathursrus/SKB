// ============================================================================
// SKB — MCP auth middleware (PIN-based Bearer token)
// ============================================================================
//
// The MCP server sits alongside the existing host/admin web surface and is
// gated by the same per-location PIN. Clients present the PIN as a Bearer
// token on every /mcp request:
//
//   Authorization: Bearer 1234
//
// We accept this as a simpler alternative to the full cookie-session flow the
// host web UI uses — MCP clients are typically agents / scripts that don't
// maintain a cookie jar and would just re-send the PIN on every call anyway.
//
// The locationId defaults to 'skb' but callers can override via the
// `X-SKB-Location` header or `?loc=` query parameter.
// ============================================================================

import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { getLocation } from '../services/locations.js';

export interface McpAuthContext {
    locationId: string;
}

function resolveLocation(req: Request): string {
    const fromHeader = req.headers['x-skb-location'];
    if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;
    const fromQuery = req.query.loc;
    if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
    return 'skb';
}

function extractBearer(req: Request): string | null {
    const hdr = req.headers.authorization ?? req.headers['Authorization'];
    if (typeof hdr !== 'string') return null;
    const m = /^Bearer\s+(.+)$/i.exec(hdr.trim());
    return m?.[1]?.trim() ?? null;
}

/**
 * Validate the Bearer PIN on the incoming request. Returns an auth context
 * on success, or an error code on failure. This is intentionally synchronous
 * for the fast path — only the DB lookup for per-location PIN is async, and
 * we short-circuit to SKB_HOST_PIN when no per-location PIN is set.
 */
export async function authenticateMcpRequest(
    req: Request,
): Promise<{ ok: true; ctx: McpAuthContext } | { ok: false; status: 401 | 503; reason: string }> {
    const provided = extractBearer(req);
    if (!provided) return { ok: false, status: 401, reason: 'missing Bearer PIN' };

    const locationId = resolveLocation(req);
    let expected: string | null = null;
    try {
        const location = await getLocation(locationId);
        expected = location?.pin ?? process.env.SKB_HOST_PIN ?? null;
    } catch {
        expected = process.env.SKB_HOST_PIN ?? null;
    }
    if (!expected) return { ok: false, status: 503, reason: 'host auth not configured' };

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return { ok: false, status: 401, reason: 'invalid PIN' };
    try {
        if (!timingSafeEqual(a, b)) return { ok: false, status: 401, reason: 'invalid PIN' };
    } catch {
        return { ok: false, status: 401, reason: 'invalid PIN' };
    }
    return { ok: true, ctx: { locationId } };
}
