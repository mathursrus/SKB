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

export async function sendSms(to: string, body: string): Promise<SmsSendResult> {
    const config = getConfig();
    if (!config) {
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'sms.not_configured' }));
        return { messageId: '', status: 'not_configured', successful: false };
    }

    const client = twilio(config.accountSid, config.authToken);
    try {
        const msg = await client.messages.create({
            from: config.fromNumber,
            to: `+1${to}`,
            body,
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
