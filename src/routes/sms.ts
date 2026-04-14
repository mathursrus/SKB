// ============================================================================
// SKB - Inbound SMS webhook (Twilio) — multi-tenant
// ============================================================================
// Twilio POSTs application/x-www-form-urlencoded to this endpoint whenever an
// SMS arrives at a configured restaurant number. We validate the signature,
// look up whichever queue_entry currently matches the sender phone on today's
// service day, and append an inbound ChatMessage to that entry's thread.
// Unmatched messages are still persisted (entryCode: null) for audit but do
// NOT open a new thread.
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { appendInbound } from '../services/chat.js';
import { validateTwilioSignature } from '../middleware/twilioValidation.js';

function loc(req: Request): string {
    return String(req.params.loc ?? 'skb');
}

function twiml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
}

export function smsRouter(): Router {
    const r = Router({ mergeParams: true });

    r.post('/sms/inbound', validateTwilioSignature, async (req: Request, res: Response) => {
        const from = String((req.body as Record<string, unknown>)?.From ?? '');
        const body = String((req.body as Record<string, unknown>)?.Body ?? '');
        const sid = String((req.body as Record<string, unknown>)?.MessageSid ?? '');
        if (!from || !body) {
            res.status(400).type('text/xml').send(twiml());
            return;
        }
        try {
            const result = await appendInbound(loc(req), from, body, sid);
            if (result.matched) {
                console.log(JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'info',
                    msg: 'chat.inbound',
                    loc: loc(req),
                    code: result.entryCode,
                    from: '******' + from.slice(-4),
                    len: body.length,
                    sid,
                }));
            } else {
                console.log(JSON.stringify({
                    t: new Date().toISOString(),
                    level: 'warn',
                    msg: 'sms.inbound.unmatched',
                    loc: loc(req),
                    from: '******' + from.slice(-4),
                    len: body.length,
                }));
            }
            // Twilio expects 200 with empty TwiML (no auto-reply from our side)
            res.type('text/xml').send(twiml());
        } catch (err) {
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'error',
                msg: 'sms.inbound.error',
                loc: loc(req),
                detail: err instanceof Error ? err.message : String(err),
            }));
            res.status(503).type('text/xml').send(twiml());
        }
    });

    return r;
}
