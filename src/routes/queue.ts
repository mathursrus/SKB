// ============================================================================
// SKB - Diner-facing queue routes
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { getQueueState, joinQueue, getStatusByCode, getBoardEntries } from '../services/queue.js';
import { rateLimit } from '../middleware/rateLimit.js';
import type { ErrorDTO } from '../types/queue.js';

const JOIN_WINDOW_MS = 10 * 60 * 1000; // 10 min
const JOIN_MAX = 5;

export function queueRouter(): Router {
    const r = Router();

    r.get('/queue/state', async (_req: Request, res: Response) => {
        try {
            const state = await getQueueState();
            res.json(state);
        } catch (err) {
            handleDbError(res, err);
        }
    });

    r.get('/queue/board', async (_req: Request, res: Response) => {
        try {
            const entries = await getBoardEntries();
            res.json(entries);
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
                phoneLast4?: unknown;
            };
            const err = validateJoin(body);
            if (err) {
                res.status(400).json(err);
                return;
            }
            try {
                const result = await joinQueue({
                    name: String(body.name).trim(),
                    partySize: Number(body.partySize),
                    phoneLast4:
                        typeof body.phoneLast4 === 'string' && body.phoneLast4 !== ''
                            ? body.phoneLast4
                            : undefined,
                });
                console.log(
                    JSON.stringify({
                        t: new Date().toISOString(),
                        level: 'info',
                        msg: 'queue.join',
                        code: result.code,
                        partySize: Number(body.partySize),
                        position: result.position,
                    }),
                );
                res.json(result);
            } catch (e) {
                handleDbError(res, e);
            }
        },
    );

    r.get('/queue/status', async (req: Request, res: Response) => {
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
    });

    return r;
}

function validateJoin(body: {
    name?: unknown;
    partySize?: unknown;
    phoneLast4?: unknown;
}): ErrorDTO | null {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 60) {
        return { error: 'name must be 1..60 chars', field: 'name' };
    }
    const size = Number(body.partySize);
    if (!Number.isInteger(size) || size < 1 || size > 10) {
        return { error: 'partySize must be 1..10', field: 'partySize' };
    }
    if (body.phoneLast4 !== undefined && body.phoneLast4 !== '') {
        const p = String(body.phoneLast4);
        if (!/^\d{4}$/.test(p)) {
            return { error: 'phoneLast4 must be 4 digits', field: 'phoneLast4' };
        }
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
