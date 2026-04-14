// ============================================================================
// SKB — SMS service (Twilio provider, future ACS migration in #33)
// ============================================================================

import twilio from 'twilio';

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

export async function sendSms(to: string, body: string): Promise<SmsSendResult> {
    const config = getConfig();
    if (!config) {
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'sms.not_configured' }));
        return { messageId: '', status: 'not_configured', successful: false };
    }

    const client = twilio(config.accountSid, config.authToken);
    const statusCallback = buildStatusCallbackUrl();
    try {
        const msg = await client.messages.create({
            from: config.fromNumber,
            to: `+1${to}`,
            body,
            ...(statusCallback ? { statusCallback } : {}),
        });
        console.log(JSON.stringify({
            t: new Date().toISOString(), level: 'info', msg: 'sms.sent',
            to: maskPhone(to), messageId: msg.sid, status: msg.status,
        }));
        return { messageId: msg.sid, status: msg.status, successful: true };
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(JSON.stringify({
            t: new Date().toISOString(), level: 'error', msg: 'sms.failed',
            to: maskPhone(to), error: errMsg,
        }));
        return { messageId: '', status: 'failed', successful: false };
    }
}

export function maskPhone(phone: string): string {
    return '******' + phone.slice(-4);
}
