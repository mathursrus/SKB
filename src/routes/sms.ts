// ============================================================================
// SKB - SMS webhooks (Twilio)
// ============================================================================
// Three routers are exported:
//
//   smsRouter()              — tenant-scoped, mounted at /r/:loc/api. Legacy
//                              path; stays wired for the SKB long code until
//                              the post-TFV shared-number cutover (#69).
//
//   smsGlobalInboundRouter() — tenant-agnostic, mounted at /api. Receives
//                              inbound on the shared OSH toll-free number
//                              (#69). Handles STOP/START/HELP at the platform
//                              level, then resolves the tenant by phone via
//                              resolveInboundTenant(), then delegates to
//                              appendInbound() with the resolved locationId.
//
//   smsStatusRouter()        — tenant-global, mounted at /api. Handles Twilio
//                              message delivery statusCallback events. We
//                              don't need /r/:loc because Twilio provides
//                              MessageSid in every callback and the handler
//                              only logs — it does not touch queue state.
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { appendInbound, resolveInboundTenant } from '../services/chat.js';
import { recordOptOut, clearOptOut } from '../services/smsOptOuts.js';
import { validateTwilioSignature } from '../middleware/twilioValidation.js';
import { isStopKeyword, isStartKeyword, isHelpKeyword } from '../utils/smsKeywords.js';
import { normalizePhone } from '../utils/smsPhone.js';
import { serviceDay } from '../core/utils/time.js';

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

function twimlHelp(): string {
    const body = 'OSH: Msgs about your restaurant waitlist. Reply STOP to unsubscribe. Support: support@osh.example.com. Msg&data rates may apply.';
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${body}</Message></Response>`;
}

/**
 * Tenant-agnostic inbound handler for the shared OSH toll-free number (#69).
 * Twilio POSTs here when the shared number receives an SMS. We:
 *   1. Honor STOP/START/HELP at the platform level, before tenant resolution.
 *   2. Resolve the tenant from the sender's phone via active queue entries.
 *   3. On single match, delegate to appendInbound(locationId, ...).
 *   4. On collision or no match, log and drop (R6 disambiguation is tracked
 *      separately; it activates only once we have real multi-tenant traffic).
 */
export function smsGlobalInboundRouter(): Router {
    const r = Router();

    r.post('/sms/inbound', validateTwilioSignature, async (req: Request, res: Response) => {
        const from = String((req.body as Record<string, unknown>)?.From ?? '');
        const body = String((req.body as Record<string, unknown>)?.Body ?? '');
        const sid  = String((req.body as Record<string, unknown>)?.MessageSid ?? '');
        if (!from || !body) {
            res.status(400).type('text/xml').send(twiml());
            return;
        }
        const normalized = normalizePhone(from);

        // 1. STOP / START / HELP handling (before any tenant resolution).
        if (isStopKeyword(body)) {
            await recordOptOut(normalized);
            console.log(JSON.stringify({
                t: new Date().toISOString(), level: 'info',
                msg: 'sms.inbound.stop_received', from: maskPhone(from),
            }));
            res.type('text/xml').send(twiml());
            return;
        }
        if (isStartKeyword(body)) {
            await clearOptOut(normalized);
            console.log(JSON.stringify({
                t: new Date().toISOString(), level: 'info',
                msg: 'sms.inbound.start_received', from: maskPhone(from),
            }));
            res.type('text/xml').send(twiml());
            return;
        }
        if (isHelpKeyword(body)) {
            console.log(JSON.stringify({
                t: new Date().toISOString(), level: 'info',
                msg: 'sms.inbound.help_responded', from: maskPhone(from),
            }));
            res.type('text/xml').send(twimlHelp());
            return;
        }

        // 2. Resolve which tenant this reply belongs to.
        try {
            const outcome = await resolveInboundTenant(normalized, serviceDay(new Date()));
            if (outcome.kind === 'match') {
                await appendInbound(outcome.locationId, from, body, sid);
                console.log(JSON.stringify({
                    t: new Date().toISOString(), level: 'info',
                    msg: 'chat.inbound', loc: outcome.locationId,
                    code: outcome.entryCode, from: maskPhone(from), len: body.length, sid,
                }));
            } else if (outcome.kind === 'collision') {
                // R6 disambiguation is tracked as a follow-up; for now, log and
                // drop so the host-side UX doesn't silently mis-route.
                console.log(JSON.stringify({
                    t: new Date().toISOString(), level: 'warn',
                    msg: 'sms.inbound.collision',
                    from: maskPhone(from),
                    candidates: outcome.candidateLocationIds,
                }));
            } else {
                console.log(JSON.stringify({
                    t: new Date().toISOString(), level: 'warn',
                    msg: 'sms.inbound.unmatched', from: maskPhone(from), len: body.length,
                }));
            }
            res.type('text/xml').send(twiml());
        } catch (err) {
            console.log(JSON.stringify({
                t: new Date().toISOString(), level: 'error',
                msg: 'sms.inbound.error',
                detail: err instanceof Error ? err.message : String(err),
            }));
            res.status(503).type('text/xml').send(twiml());
        }
    });

    return r;
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
