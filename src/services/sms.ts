// ============================================================================
// SKB — SMS service (Twilio provider, future ACS migration in #33)
// ============================================================================
// This is the single outbound chokepoint. Two shared-number concerns are
// centralized here so no caller has to remember them (issue #69):
//   1. Opt-out suppression: check the platform-wide smsOptOuts ledger before
//      any Twilio API call. If the recipient opted out, log and abort.
//   2. Sender-name prefix: prepend the tenant's display name ("Shri Krishna
//      Bhavan: ...") so guests can tell which restaurant a text is about,
//      even though many restaurants share the platform number.

import twilio from 'twilio';

import { getLocation } from './locations.js';
import { isOptedOut } from './smsOptOuts.js';
import { applySenderPrefix } from '../utils/smsSenderPrefix.js';

export interface SmsSendResult {
    messageId: string;
    status: string;
    successful: boolean;
}

interface SmsConfig {
    accountSid: string;
    authToken: string;
    fromNumber: string;
}

function getConfig(): SmsConfig | null {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromNumber) return null;
    return { accountSid, authToken, fromNumber };
}

// Twilio's messages.create() returns status=queued and dispatches delivery
// asynchronously. Final state (delivered / failed / undelivered + error_code)
// is only reported by a statusCallback POST. Without one, carrier rejections
// (e.g. 30034 "unregistered 10DLC") are invisible to the app. The route lives
// at /api/sms/status in src/routes/sms.ts and is tenant-global — we only log
// from it, so we don't need /r/:loc scoping.
function buildStatusCallbackUrl(): string | undefined {
    const base = process.env.SKB_PUBLIC_BASE_URL;
    if (!base) return undefined;
    return `${base.replace(/\/$/, '')}/api/sms/status`;
}

/**
 * Resolve a tenant's display name for the SMS sender prefix. Precedence:
 * `location.smsSenderName` → `location.name` → undefined (caller falls back
 * to "OSH" via applySenderPrefix).
 */
async function resolveSenderName(locationId: string | undefined): Promise<string | undefined> {
    if (!locationId) return undefined;
    const location = await getLocation(locationId);
    if (!location) return undefined;
    return location.smsSenderName || location.name;
}

export interface SendSmsOptions {
    /** Tenant location id; used to resolve display-name prefix and opt-out tenant hint. */
    locationId?: string;
}

export async function sendSms(
    to: string,
    body: string,
    opts: SendSmsOptions = {},
): Promise<SmsSendResult> {
    // Config short-circuit first so environments without Twilio credentials
    // (unit tests, CI without secrets) don't fan out to Mongo for the
    // opt-out check.
    const config = getConfig();
    if (!config) {
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'sms.not_configured' }));
        return { messageId: '', status: 'not_configured', successful: false };
    }

    // Opt-out short-circuit (platform-wide; see services/smsOptOuts.ts).
    if (await isOptedOut(to)) {
        console.log(JSON.stringify({
            t: new Date().toISOString(),
            level: 'info',
            msg: 'sms.suppressed_opt_out',
            to: maskPhone(to),
            loc: opts.locationId,
        }));
        return { messageId: '', status: 'opted_out', successful: false };
    }

    const senderName = await resolveSenderName(opts.locationId);
    const prefixedBody = applySenderPrefix(body, senderName);

    const client = twilio(config.accountSid, config.authToken);
    const statusCallback = buildStatusCallbackUrl();
    try {
        const msg = await client.messages.create({
            from: config.fromNumber,
            to: `+1${to}`,
            body: prefixedBody,
            ...(statusCallback ? { statusCallback } : {}),
        });
        console.log(JSON.stringify({
            t: new Date().toISOString(), level: 'info', msg: 'sms.sent',
            to: maskPhone(to), messageId: msg.sid, status: msg.status, loc: opts.locationId,
        }));
        return { messageId: msg.sid, status: msg.status, successful: true };
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(JSON.stringify({
            t: new Date().toISOString(), level: 'error', msg: 'sms.failed',
            to: maskPhone(to), error: errMsg, loc: opts.locationId,
        }));
        return { messageId: '', status: 'failed', successful: false };
    }
}

export function maskPhone(phone: string): string {
    return '******' + phone.slice(-4);
}
