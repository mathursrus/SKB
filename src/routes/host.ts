// ============================================================================
// SKB - Host-stand routes (PIN-gated via requireHost middleware)
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { callParty, listHostQueue, removeFromQueue } from '../services/queue.js';
import {
    advanceParty,
    listCompletedParties,
    listDiningParties,
    getPartyTimeline,
} from '../services/dining.js';
import { getAvgTurnTime, setAvgTurnTime } from '../services/settings.js';
import { getHostStats } from '../services/stats.js';
import { getAnalytics } from '../services/analytics.js';
import {
    loginHandler,
    logoutHandler,
    requireHost,
} from '../middleware/hostAuth.js';

export function hostRouter(): Router {
    const r = Router();

    // Public: login / logout
    r.post('/host/login', loginHandler);
    r.post('/host/logout', logoutHandler);

    // Gated routes below
    r.get('/host/queue', requireHost, async (_req: Request, res: Response) => {
        try {
            const list = await listHostQueue();
            res.json(list);
        } catch (err) {
            dbError(res, err);
        }
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
            if (!result.ok) {
                res.status(404).json({ error: 'not found or already removed' });
                return;
            }
            console.log(
                JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'info',
                    msg: 'queue.remove',
                    id,
                    reason,
                }),
            );
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') {
                res.status(400).json({ error: 'invalid id' });
                return;
            }
            dbError(res, err);
        }
    });

    r.post('/host/queue/:id/call', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const result = await callParty(id);
            if (!result.ok) {
                res.status(404).json({ error: 'not found or not waiting' });
                return;
            }
            console.log(
                JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'info',
                    msg: 'queue.call',
                    id,
                }),
            );
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') {
                res.status(400).json({ error: 'invalid id' });
                return;
            }
            dbError(res, err);
        }
    });

    // Dining lifecycle routes
    r.get('/host/dining', requireHost, async (_req: Request, res: Response) => {
        try {
            const list = await listDiningParties();
            res.json(list);
        } catch (err) {
            dbError(res, err);
        }
    });

    r.get('/host/completed', requireHost, async (_req: Request, res: Response) => {
        try {
            const list = await listCompletedParties();
            res.json(list);
        } catch (err) {
            dbError(res, err);
        }
    });

    r.get('/host/queue/:id/timeline', requireHost, async (req: Request, res: Response) => {
        const id = String(req.params.id);
        try {
            const timeline = await getPartyTimeline(id);
            if (!timeline) {
                res.status(404).json({ error: 'not found' });
                return;
            }
            res.json(timeline);
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') {
                res.status(400).json({ error: 'invalid id' });
                return;
            }
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
            if (!result.ok) {
                res.status(404).json({ error: 'not found' });
                return;
            }
            console.log(
                JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'info',
                    msg: 'queue.advance',
                    id,
                    state: targetState,
                }),
            );
            res.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message === 'invalid id') {
                res.status(400).json({ error: 'invalid id' });
                return;
            }
            if (err instanceof Error && err.message.startsWith('cannot advance')) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (err instanceof Error && err.message.startsWith('invalid target state')) {
                res.status(400).json({ error: err.message });
                return;
            }
            dbError(res, err);
        }
    });

    r.get('/host/analytics', requireHost, async (req: Request, res: Response) => {
        const range = String(req.query.range ?? '7');
        const partySize = String(req.query.partySize ?? 'all');
        try {
            const data = await getAnalytics(range, partySize);
            res.json(data);
        } catch (err) {
            dbError(res, err);
        }
    });

    r.get('/host/stats', requireHost, async (_req: Request, res: Response) => {
        try {
            const stats = await getHostStats();
            res.json(stats);
        } catch (err) {
            dbError(res, err);
        }
    });

    r.get('/host/settings', requireHost, async (_req: Request, res: Response) => {
        try {
            const avg = await getAvgTurnTime();
            res.json({ avgTurnTimeMinutes: avg });
        } catch (err) {
            dbError(res, err);
        }
    });

    r.post('/host/settings', requireHost, async (req: Request, res: Response) => {
        const n = Number(req.body?.avgTurnTimeMinutes);
        try {
            const saved = await setAvgTurnTime(n);
            res.json({ avgTurnTimeMinutes: saved });
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('avgTurnTimeMinutes')) {
                res.status(400).json({ error: err.message, field: 'avgTurnTimeMinutes' });
                return;
            }
            dbError(res, err);
        }
    });

    return r;
}

function dbError(res: Response, err: unknown): void {
    console.log(
        JSON.stringify({
            t: new Date().toISOString(),
            level: 'error',
            msg: 'db.error',
            detail: err instanceof Error ? err.message : String(err),
        }),
    );
    res.status(503).json({ error: 'temporarily unavailable' });
}
