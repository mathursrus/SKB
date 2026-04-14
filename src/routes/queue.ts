// ============================================================================
// SKB - Diner-facing queue routes — multi-tenant
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { getBoardEntries, getQueueState, joinQueue, getStatusByCode, acknowledgeOnMyWay } from '../services/queue.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sendSms } from '../services/sms.js';
import { joinConfirmationMessage } from '../services/smsTemplates.js';
import type { ErrorDTO } from '../types/queue.js';

const JOIN_WINDOW_MS = 10 * 60 * 1000; // 10 min
const JOIN_MAX = 5;

// R20: 1 status request / 5s / code. Diner poll cadence is 15s, so this only
// bites on abusive polling.
const STATUS_WINDOW_MS = 5_000;
const STATUS_MAX = 1;

/** Extract locationId from req.params.loc (set by parent router mount). */
function loc(req: Request): string {
    return String(req.params.loc ?? 'skb');
}

export function queueRouter(): Router {
    const r = Router({ mergeParams: true });

    r.get('/queue/board', async (req: Request, res: Response) => {
        try {
            const entries = await getBoardEntries(loc(req));
            res.json(entries);
        } catch (err) {
            handleDbError(res, err);
        }
    });

    r.get('/queue/state', async (req: Request, res: Response) => {
        try {
            const state = await getQueueState(loc(req));
            res.json(state);
        } catch (err) {
            handleDbError(res, err);
        }
    });

    r.post(
        '/queue/join',
        rateLimit({ windowMs: JOIN_WINDOW_MS, max: JOIN_MAX }),
        async (req: Request, res: Response) => {
            const body = req.body as {
                name?: unknown;
                partySize?: unknown;
                phone?: unknown;
            };
            const err = validateJoin(body);
            if (err) {
                res.status(400).json(err);
                return;
            }
            try {
                const phone = String(body.phone).trim();
                const result = await joinQueue(loc(req), {
                    name: String(body.name).trim(),
                    partySize: Number(body.partySize),
                    phone,
                });
                console.log(
                    JSON.stringify({
                        t: new Date().toISOString(),
                        level: 'info',
                        msg: 'queue.join',
                        loc: loc(req),
                        code: result.code,
                        partySize: Number(body.partySize),
                        position: result.position,
                    }),
                );
                // Fire-and-forget confirmation SMS
                const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
                const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
                const statusUrl = `${proto}://${host}/r/${loc(req)}/queue?code=${result.code}`;
                sendSms(phone, joinConfirmationMessage(result.code, statusUrl))
                    .catch(e => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'sms.join_confirm_failed', error: e instanceof Error ? e.message : String(e) })));
                res.json(result);
            } catch (e) {
                handleDbError(res, e);
            }
        },
    );

    r.get(
        '/queue/status',
        rateLimit({
            windowMs: STATUS_WINDOW_MS,
            max: STATUS_MAX,
            keyFn: (req) => `${loc(req)}:${String(req.query.code ?? '')}`,
        }),
        async (req: Request, res: Response) => {
            const code = String(req.query.code ?? '');
            if (!code) {
                res.status(400).json({ error: 'code required', field: 'code' });
                return;
            }
            try {
                const status = await getStatusByCode(code);
                res.json(status);
            } catch (err) {
                handleDbError(res, err);
            }
        },
    );

    r.post('/queue/acknowledge', async (req: Request, res: Response) => {
        const code = String(req.body?.code ?? '').trim();
        if (!code) {
            res.status(400).json({ error: 'code required', field: 'code' });
            return;
        }
        try {
            const result = await acknowledgeOnMyWay(code);
            if (!result.ok) {
                res.status(404).json({ error: 'not waiting' });
                return;
            }
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'info',
                msg: 'diner.ack.on_way',
                loc: loc(req),
                code,
            }));
            res.json({ ok: true });
        } catch (err) {
            handleDbError(res, err);
        }
    });

    return r;
}

function validateJoin(body: {
    name?: unknown;
    partySize?: unknown;
    phone?: unknown;
}): ErrorDTO | null {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 60) {
        return { error: 'name must be 1..60 chars', field: 'name' };
    }
    const size = Number(body.partySize);
    if (!Number.isInteger(size) || size < 1 || size > 10) {
        return { error: 'partySize must be 1..10', field: 'partySize' };
    }
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!/^\d{10}$/.test(phone)) {
        return { error: 'phone must be exactly 10 digits', field: 'phone' };
    }
    return null;
}

function handleDbError(res: Response, err: unknown): void {
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
