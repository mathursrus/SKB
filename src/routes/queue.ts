// ============================================================================
// SKB - Diner-facing queue routes — multi-tenant
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { buildQueueStatusUrl } from '../core/utils/url.js';
import { getBoardEntries, getQueueState, joinQueue, getStatusByCode, acknowledgeOnMyWay } from '../services/queue.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sendSms } from '../services/sms.js';
import { joinConfirmationMessage } from '../services/smsTemplates.js';
import { appendInboundFromCode, getChatThreadByCode } from '../services/chat.js';
import { getGuestCartByCode, placeGuestOrder, upsertGuestCart } from '../services/orders.js';
import type { ErrorDTO, GuestCartLineInputDTO } from '../types/queue.js';

const JOIN_WINDOW_MS = 10 * 60 * 1000; // 10 min
const JOIN_MAX = 5;

// R20: 1 status request / 5s / code. Diner poll cadence is 15s, so this only
// bites on abusive polling.
const STATUS_WINDOW_MS = 5_000;
const STATUS_MAX = 1;

// Diner chat (issue #50 bug 1). Reads are poll-friendly; writes are tight
// so a bored kid can't spam the thread from the queue page.
const CHAT_READ_WINDOW_MS = 2_000;
const CHAT_READ_MAX = 1;
const CHAT_WRITE_WINDOW_MS = 3_000;
const CHAT_WRITE_MAX = 1;
const MAX_CHAT_BODY = 500;
const ORDER_WINDOW_MS = 2_000;
const ORDER_MAX = 2;

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
                const smsConsent = (body as { smsConsent?: unknown }).smsConsent === true;
                const result = await joinQueue(loc(req), {
                    name: String(body.name).trim(),
                    partySize: Number(body.partySize),
                    phone,
                    smsConsent,
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
                        smsConsent,
                    }),
                );
                // Fire-and-forget confirmation SMS — only when the diner
                // explicitly opted in (TFV 30513). Diners who don't opt in
                // watch the status card on /queue.html?code=... instead.
                if (smsConsent) {
                    const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
                    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
                    const statusUrl = buildQueueStatusUrl(`${proto}://${host}`, loc(req), result.code);
                    sendSms(phone, joinConfirmationMessage(result.code, statusUrl))
                        .catch(e => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'sms.join_confirm_failed', error: e instanceof Error ? e.message : String(e) })));
                }
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

    // Diner chat (issue #50 bug 1): GET the thread by party code so the
    // diner can see host messages in-page even if they don't check SMS.
    r.get(
        '/queue/chat/:code',
        rateLimit({
            windowMs: CHAT_READ_WINDOW_MS,
            max: CHAT_READ_MAX,
            keyFn: (req) => `${loc(req)}:chat-read:${String(req.params.code ?? '')}`,
        }),
        async (req: Request, res: Response) => {
            const code = String(req.params.code ?? '').trim();
            if (!code) {
                res.status(400).json({ error: 'code required', field: 'code' });
                return;
            }
            try {
                const thread = await getChatThreadByCode(loc(req), code);
                if (!thread) {
                    res.status(404).json({ error: 'thread not found' });
                    return;
                }
                res.json(thread);
            } catch (err) {
                handleDbError(res, err);
            }
        },
    );

    // Diner chat: POST a message from the diner's web view. The host sees it
    // on their next poll of the thread; no SMS is sent because the diner
    // already knows what they just typed.
    r.post(
        '/queue/chat/:code',
        rateLimit({
            windowMs: CHAT_WRITE_WINDOW_MS,
            max: CHAT_WRITE_MAX,
            keyFn: (req) => `${loc(req)}:chat-write:${String(req.params.code ?? '')}`,
        }),
        async (req: Request, res: Response) => {
            const code = String(req.params.code ?? '').trim();
            const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
            if (!code) {
                res.status(400).json({ error: 'code required', field: 'code' });
                return;
            }
            if (!body || body.length > MAX_CHAT_BODY) {
                res.status(400).json({ error: `body must be 1..${MAX_CHAT_BODY} chars`, field: 'body' });
                return;
            }
            try {
                const result = await appendInboundFromCode(loc(req), code, body);
                if (!result.ok) {
                    res.status(404).json({ error: 'thread not found or closed', state: result.state });
                    return;
                }
                console.log(JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'info',
                    msg: 'diner.chat.inbound_web',
                    loc: loc(req),
                    code,
                    length: body.length,
                }));
                res.json({ ok: true });
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

    r.get('/queue/order', async (req: Request, res: Response) => {
        const code = String(req.query.code ?? '').trim();
        if (!code) {
            res.status(400).json({ error: 'code required', field: 'code' });
            return;
        }
        try {
            res.json(await getGuestCartByCode(loc(req), code));
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('order.')) {
                res.status(404).json({ error: 'not found' });
                return;
            }
            handleDbError(res, err);
        }
    });

    r.post(
        '/queue/order/draft',
        rateLimit({
            windowMs: ORDER_WINDOW_MS,
            max: ORDER_MAX,
            keyFn: (req) => `${loc(req)}:order-draft:${String(req.body?.code ?? '')}`,
        }),
        async (req: Request, res: Response) => {
            const code = String(req.body?.code ?? '').trim();
            const lines = ((req.body as { lines?: unknown })?.lines ?? []) as GuestCartLineInputDTO[];
            if (!code) {
                res.status(400).json({ error: 'code required', field: 'code' });
                return;
            }
            try {
                res.json(await upsertGuestCart(loc(req), code, Array.isArray(lines) ? lines : ([] as GuestCartLineInputDTO[])));
            } catch (err) {
                if (err instanceof Error && (
                    err.message.startsWith('cart.')
                    || err.message.startsWith('order.')
                )) {
                    res.status(400).json({ error: err.message });
                    return;
                }
                handleDbError(res, err);
            }
        },
    );

    r.post(
        '/queue/order/place',
        rateLimit({
            windowMs: ORDER_WINDOW_MS,
            max: ORDER_MAX,
            keyFn: (req) => `${loc(req)}:order-place:${String(req.body?.code ?? '')}`,
        }),
        async (req: Request, res: Response) => {
            const code = String(req.body?.code ?? '').trim();
            if (!code) {
                res.status(400).json({ error: 'code required', field: 'code' });
                return;
            }
            try {
                res.json(await placeGuestOrder(loc(req), code));
            } catch (err) {
                if (err instanceof Error && err.message.startsWith('order.')) {
                    res.status(400).json({ error: err.message });
                    return;
                }
                handleDbError(res, err);
            }
        },
    );

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
    // Defense in depth: reject names containing HTML/script metacharacters.
    // Client renderers escapeHtml when inserting names into the DOM, so no
    // XSS is actually possible today — but a stored `<script>` payload still
    // pollutes the DB, host-stand SMS bodies, and any future integration
    // that trusts the stored name. Legitimate names don't contain <, >, or \.
    if (/[<>\\]/.test(name)) {
        return { error: 'name contains unsupported characters', field: 'name' };
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
