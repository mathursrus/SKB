// ============================================================================
// SKB - Host-stand routes (PIN-gated) — multi-tenant
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { callParty, listHostQueue, removeFromQueue, logCallDial } from '../services/queue.js';
import { sendChatMessage, getChatThread, markThreadRead } from '../services/chat.js';
import {
    chatAlmostReadyMessage,
    chatNeedMoreTimeMessage,
    chatLostYouMessage,
} from '../services/smsTemplates.js';
import {
    advanceParty,
    listCompletedParties,
    listDiningParties,
    getPartyTimeline,
} from '../services/dining.js';
import { getAvgTurnTime, getEffectiveTurnTime, setAvgTurnTime, setEtaMode } from '../services/settings.js';
import type { EtaMode } from '../types/queue.js';
import { getHostStats } from '../services/stats.js';
import { getAnalytics } from '../services/analytics.js';
import { getLocation } from '../services/locations.js';
import { verifyCookie, __test__ } from '../middleware/hostAuth.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

function loc(req: Request): string {
    return String(req.params.loc ?? 'skb');
}

function cookieSecret(): string | null {
    return process.env.SKB_COOKIE_SECRET ?? null;
}

const COOKIE_NAME = 'skb_host';
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Middleware: 401 unless a valid host cookie is present. */
function requireHost(req: Request, res: Response, next: () => void): void {
    const key = cookieSecret();
    if (!key) { res.status(503).json({ error: 'host auth not configured' }); return; }
    const raw = readCookie(req.headers.cookie);
    if (!raw || !verifyCookie(raw, key)) { res.status(401).json({ error: 'unauthorized' }); return; }
    next();
}

function readCookie(header: string | undefined): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        if (part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim();
    }
    return null;
}

function sign(payload: string, key: string): string {
    return createHmac('sha256', key).update(payload).digest('hex');
}

function mintCookie(now: Date, key: string): string {
    const exp = Math.floor(now.getTime() / 1000) + COOKIE_MAX_AGE_SECONDS;
    return `${exp}.${sign(String(exp), key)}`;
}

export function hostRouter(): Router {
    const r = Router({ mergeParams: true });

    // Login — uses per-location PIN from locations collection, falls back to env var.
    r.post('/host/login', async (req: Request, res: Response) => {
        const key = cookieSecret();
        if (!key) { res.status(503).json({ error: 'host auth not configured' }); return; }

        const location = await getLocation(loc(req));
        const expectedPin = location?.pin ?? process.env.SKB_HOST_PIN ?? null;
        if (!expectedPin) { res.status(503).json({ error: 'host auth not configured' }); return; }

        const provided = String(req.body?.pin ?? '');
        if (!provided) { res.status(400).json({ error: 'pin required', field: 'pin' }); return; }

        const a = Buffer.from(provided);
        const b = Buffer.from(expectedPin);
        let ok = false;
        if (a.length === b.length) { try { ok = timingSafeEqual(a, b); } catch { ok = false; } }

        if (!ok) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'host.auth.fail', loc: loc(req), ip: req.ip }));
            res.status(401).json({ error: 'invalid pin' });
            return;
        }

        const cookie = mintCookie(new Date(), key);
        res.setHeader('Set-Cookie', `${COOKIE_NAME}=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS}`);
        res.json({ ok: true });
    });

    r.post('/host/logout', (_req: Request, res: Response) => {
        res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
        res.json({ ok: true });
    });

    // All routes below require host auth
    r.get('/host/queue', requireHost, async (req: Request, res: Response) => {
        try { res.json(await listHostQueue(loc(req))); }
        catch (err) { dbError(res, err); }
    });

    r.post('/host/queue/:id/remove', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const reason = String(req.body?.reason ?? '');
        if (reason !== 'seated' && reason !== 'no_show') {
            res.status(400).json({ error: 'reason must be seated|no_show', field: 'reason' });
            return;
        }
        // R14/R15: new clients MUST supply a tableNumber when reason==='seated'.
        // Legacy callers that don't set it still work (service tolerates missing
        // tableNumber) — the route validates new clients specifically by inspecting
        // whether the field was provided at all.
        const rawTable = (req.body as { tableNumber?: unknown })?.tableNumber;
        const tableProvided = rawTable !== undefined && rawTable !== null && rawTable !== '';
        if (reason === 'seated' && tableProvided) {
            const n = Number(rawTable);
            if (!Number.isInteger(n) || n < 1 || n > 999) {
                res.status(400).json({
                    error: 'tableNumber must be an integer 1..999',
                    field: 'tableNumber',
                });
                return;
            }
        }
        const override = Boolean((req.body as { override?: unknown })?.override);
        const opts = reason === 'seated' && tableProvided
            ? { tableNumber: Number(rawTable), override }
            : {};
        try {
            const result = await removeFromQueue(id, reason, opts);
            if (result.conflict) {
                console.log(JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'warn',
                    msg: 'host.seat.conflict',
                    loc: loc(req),
                    id,
                    tableNumber: opts.tableNumber,
                    occupiedBy: result.conflict.partyName,
                }));
                res.status(409).json({
                    error: 'table_occupied',
                    tableNumber: opts.tableNumber,
                    occupiedBy: result.conflict.partyName,
                });
                return;
            }
            if (!result.ok) { res.status(404).json({ error: 'not found or already removed' }); return; }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'queue.remove',
                loc: loc(req),
                id,
                reason,
                tableNumber: 'tableNumber' in opts ? opts.tableNumber : undefined,
                override,
            }));
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    r.post('/host/queue/:id/call', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const result = await callParty(id);
            if (!result.ok) { res.status(404).json({ error: 'not found or not waiting' }); return; }
            res.json({ ok: true, smsStatus: result.smsStatus });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    // R11: best-effort log when the host taps the tel: dial link. Fire-and-forget
    // from the client; response is advisory so failures are silent.
    r.post('/host/queue/:id/call-log', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            await logCallDial(id);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'host.call_dial',
                loc: loc(req),
                id,
            }));
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    // R10: send a chat message (outbound SMS + thread append).
    r.post('/host/queue/:id/chat', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const raw = (req.body as { body?: unknown })?.body;
        const body = typeof raw === 'string' ? raw.trim() : '';
        if (body.length === 0 || body.length > 1600) {
            res.status(400).json({ error: 'body must be 1..1600 chars', field: 'body' });
            return;
        }
        try {
            const result = await sendChatMessage(id, body);
            if (!result.ok) { res.status(404).json({ error: 'entry not found' }); return; }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: result.smsStatus === 'failed' ? 'error' : 'info',
                msg: result.smsStatus === 'failed' ? 'chat.outbound.failed' : 'chat.outbound',
                loc: loc(req),
                id,
                len: body.length,
                smsStatus: result.smsStatus,
            }));
            res.json({ ok: true, smsStatus: result.smsStatus, message: result.message });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    // R10/R21: fetch chat thread (oldest → newest) with cursor pagination.
    r.get('/host/queue/:id/chat', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
        const beforeRaw = req.query.before;
        const before = typeof beforeRaw === 'string' && beforeRaw.length > 0 ? new Date(beforeRaw) : undefined;
        try {
            const thread = await getChatThread(id, { limit, before });
            if (!thread) { res.status(404).json({ error: 'entry not found' }); return; }
            res.json(thread);
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    // R10: mark all inbound messages for this entry as read.
    r.patch('/host/queue/:id/chat/read', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const result = await markThreadRead(id);
            res.json({ ok: true, updated: result.updated });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    // R10: expose the quick-reply templates to the client so host.js doesn't
    // have to hardcode wording that lives server-side in smsTemplates.ts.
    r.get('/host/chat/templates', requireHost, async (req: Request, res: Response) => {
        const code = String(req.query.code ?? '');
        if (!code) { res.status(400).json({ error: 'code required', field: 'code' }); return; }
        res.json({
            almostReady: chatAlmostReadyMessage(code),
            needMoreTime: chatNeedMoreTimeMessage(code),
            lostYou: chatLostYouMessage(code),
        });
    });

    r.get('/host/dining', requireHost, async (req: Request, res: Response) => {
        try { res.json(await listDiningParties(loc(req))); }
        catch (err) { dbError(res, err); }
    });

    r.get('/host/completed', requireHost, async (req: Request, res: Response) => {
        try { res.json(await listCompletedParties(loc(req))); }
        catch (err) { dbError(res, err); }
    });

    r.get('/host/queue/:id/timeline', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const timeline = await getPartyTimeline(id);
            if (!timeline) { res.status(404).json({ error: 'not found' }); return; }
            res.json(timeline);
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') { res.status(400).json({ error: 'invalid id' }); return; }
            dbError(res, err);
        }
    });

    r.post('/host/queue/:id/advance', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        const targetState = String(req.body?.state ?? '');
        const validStates = ['ordered', 'served', 'checkout', 'departed'];
        if (!validStates.includes(targetState)) {
            res.status(400).json({ error: 'state must be ordered|served|checkout|departed', field: 'state' });
            return;
        }
        try {
            const result = await advanceParty(id, targetState);
            if (!result.ok) { res.status(404).json({ error: 'not found' }); return; }
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('cannot advance') || (err instanceof Error && err.message.startsWith('invalid'))) {
                res.status(400).json({ error: err.message });
                return;
            }
            dbError(res, err);
        }
    });

    r.get('/host/analytics', requireHost, async (req: Request, res: Response) => {
        const range = String(req.query.range ?? '7');
        const partySize = String(req.query.partySize ?? 'all');
        try { res.json(await getAnalytics(loc(req), range, partySize)); }
        catch (err) { dbError(res, err); }
    });

    r.get('/host/stats', requireHost, async (req: Request, res: Response) => {
        try { res.json(await getHostStats(loc(req))); }
        catch (err) { dbError(res, err); }
    });

    r.get('/host/settings', requireHost, async (req: Request, res: Response) => {
        try {
            const info = await getEffectiveTurnTime(loc(req));
            res.json({
                // Backwards-compat: the old single field at top level always reflects the manual value.
                avgTurnTimeMinutes: info.manualMinutes,
                etaMode: info.mode,
                effectiveMinutes: info.effectiveMinutes,
                dynamicMinutes: info.dynamicMinutes,
                sampleSize: info.sampleSize,
                fellBackToManual: info.fellBackToManual,
            });
        } catch (err) { dbError(res, err); }
    });

    r.post('/host/settings', requireHost, async (req: Request, res: Response) => {
        const body = req.body ?? {};
        const hasTurn = body.avgTurnTimeMinutes !== undefined && body.avgTurnTimeMinutes !== null;
        const hasMode = body.etaMode !== undefined && body.etaMode !== null;

        if (!hasTurn && !hasMode) {
            res.status(400).json({ error: 'provide avgTurnTimeMinutes, etaMode, or both' });
            return;
        }

        try {
            if (hasTurn) {
                await setAvgTurnTime(loc(req), Number(body.avgTurnTimeMinutes));
            }
            if (hasMode) {
                await setEtaMode(loc(req), body.etaMode as EtaMode);
            }
            const info = await getEffectiveTurnTime(loc(req));
            res.json({
                avgTurnTimeMinutes: info.manualMinutes,
                etaMode: info.mode,
                effectiveMinutes: info.effectiveMinutes,
                dynamicMinutes: info.dynamicMinutes,
                sampleSize: info.sampleSize,
                fellBackToManual: info.fellBackToManual,
            });
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('avgTurnTimeMinutes')) {
                res.status(400).json({ error: err.message, field: 'avgTurnTimeMinutes' });
                return;
            }
            if (err instanceof Error && err.message.startsWith('etaMode')) {
                res.status(400).json({ error: err.message, field: 'etaMode' });
                return;
            }
            dbError(res, err);
        }
    });

    return r;
}

function dbError(res: Response, err: unknown): void {
    console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'db.error', detail: err instanceof Error ? err.message : String(err) }));
    res.status(503).json({ error: 'temporarily unavailable' });
}
