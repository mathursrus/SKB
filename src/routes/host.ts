// ============================================================================
// SKB - Host-stand routes (PIN-gated) — multi-tenant
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { callParty, listHostQueue, removeFromQueue } from '../services/queue.js';
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
        try {
            const result = await removeFromQueue(id, reason);
            if (!result.ok) { res.status(404).json({ error: 'not found or already removed' }); return; }
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'queue.remove', loc: loc(req), id, reason }));
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
