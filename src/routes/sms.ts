// ============================================================================
// SKB - SMS webhooks (Twilio)
// ============================================================================
// Two routers are exported:
//
//   smsRouter()       — tenant-scoped, mounted at /r/:loc/api in mcp-server.
//                       Currently handles inbound SMS (/sms/inbound).
//
//   smsStatusRouter() — tenant-global, mounted at /api in mcp-server. Handles
//                       Twilio message delivery statusCallback events
//                       (/sms/status). We don't need /r/:loc because Twilio
//                       provides MessageSid in every callback and the handler
//                       only logs — it does not touch queue state.
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

function maskPhone(phone: string): string {
    if (!phone) return '';
    return '******' + phone.slice(-4);
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

// ---------------------------------------------------------------------------
// Delivery status callback (tenant-global)
// ---------------------------------------------------------------------------
// Twilio POSTs to this URL every time an outbound message's status changes —
// accepted → queued → sending → sent → delivered, or the failure terminals
// (failed / undelivered + ErrorCode). Mounted at /api/sms/status (no /r/:loc
// prefix); URL is built in src/services/sms.ts from SKB_PUBLIC_BASE_URL.
//
// Error severity rule:
//   failed | undelivered | ErrorCode set  → level=error msg=sms.delivery_failed
//   delivered                             → level=info  msg=sms.delivery_ok
//   queued | sending | sent | accepted    → level=info  msg=sms.delivery_progress
//
// Events are queryable via saved searches on the law-skb-prod workspace
// under category "SKB SMS Monitoring" — the KQL parses the structured JSON
// out of AppServiceConsoleLogs.ResultDescription. Diagnostic setting
// skb-waitlist-to-law pipes console.log to the workspace.
//
// Twilio will retry a statusCallback if we respond non-2xx, so we always
// return 204 even if the body is missing fields — there's nothing we can
// reasonably retry here.

type StatusBody = Record<string, unknown>;
function s(body: StatusBody, key: string): string {
    const v = body[key];
    return typeof v === 'string' ? v : '';
}

export function smsStatusRouter(): Router {
    const r = Router();

    r.post('/sms/status', validateTwilioSignature, (req: Request, res: Response) => {
        const body = (req.body ?? {}) as StatusBody;
        const messageSid = s(body, 'MessageSid') || s(body, 'SmsSid');
        const messageStatus = s(body, 'MessageStatus') || s(body, 'SmsStatus');
        const errorCodeRaw = s(body, 'ErrorCode');
        const errorCode = errorCodeRaw ? Number.parseInt(errorCodeRaw, 10) : null;
        const to = s(body, 'To');
        const from = s(body, 'From');
        const accountSid = s(body, 'AccountSid');

        const isTerminalFailure =
            messageStatus === 'failed' || messageStatus === 'undelivered' || errorCode !== null;
        const isDelivered = messageStatus === 'delivered';

        const base = {
            t: new Date().toISOString(),
            messageSid,
            messageStatus,
            errorCode,
            to: maskPhone(to),
            from,
            accountSid,
        };

        if (isTerminalFailure) {
            console.log(JSON.stringify({
                ...base,
                level: 'error',
                msg: 'sms.delivery_failed',
            }));
        } else if (isDelivered) {
            console.log(JSON.stringify({
                ...base,
                level: 'info',
                msg: 'sms.delivery_ok',
            }));
        } else {
            console.log(JSON.stringify({
                ...base,
                level: 'info',
                msg: 'sms.delivery_progress',
            }));
        }

        res.status(204).end();
    });

    return r;
}
