// ============================================================================
// SKB - Voice IVR routes — multi-tenant phone-based waitlist join
// ============================================================================
// Twilio sends webhooks as application/x-www-form-urlencoded.
// Each IVR step is a separate POST endpoint returning TwiML (text/xml).
// State is passed between steps via URL query parameters.
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { getQueueState, joinQueue } from '../services/queue.js';
import { getLocation } from '../services/locations.js';
import { sendSms } from '../services/sms.js';
import { joinConfirmationMessage } from '../services/smsTemplates.js';
import {
    escXml,
    formatEtaForSpeech,
    normalizeCallerPhone,
    spellOutCode,
    spellOutPhone,
} from '../services/voiceTemplates.js';
import { validateTwilioSignature } from '../middleware/twilioValidation.js';

function loc(req: Request): string {
    return String(req.params.loc ?? 'skb');
}

function twiml(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

/** Build action URL with query params, escaped for XML attributes */
function action(req: Request, path: string, params: Record<string, string> = {}): string {
    const qs = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&amp;');
    return `/r/${loc(req)}/api/voice/${path}${qs ? '?' + qs : ''}`;
}

/** Build the base URL for SMS status links */
function baseUrl(req: Request): string {
    const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
    return `${proto}://${host}`;
}

export function voiceRouter(): Router {
    const r = Router({ mergeParams: true });
    r.use(validateTwilioSignature);

    // ── Step 1: Incoming call — greeting with queue status + menu ────────
    r.post('/voice/incoming', async (req: Request, res: Response) => {
        const from = normalizeCallerPhone(req.body.From);
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'voice.incoming', loc: loc(req), from: from ? `******${from.slice(-4)}` : 'anonymous' }));

        try {
            const state = await getQueueState(loc(req));
            const location = await getLocation(loc(req));
            const name = location?.name ?? 'the restaurant';
            const eta = formatEtaForSpeech(state.etaForNewPartyMinutes);

            res.type('text/xml').send(twiml(`
<Gather input="dtmf" numDigits="1" timeout="10" action="${action(req, 'menu-choice', { from })}">
  <Say voice="Polly.Joanna">Hello, and thank you for calling ${escXml(name)}! There are currently ${state.partiesWaiting} parties ahead of you, with an estimated wait of ${eta}. To add your name to the waitlist, press 1. To hear the wait time again, press 2.</Say>
</Gather>
<Say>We didn't receive any input. Thank you for calling. Goodbye.</Say>
<Hangup/>`));
        } catch (err) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'voice.incoming.error', error: err instanceof Error ? err.message : String(err) }));
            res.type('text/xml').send(twiml(`<Say>We're experiencing a technical issue. Please try again later. Goodbye.</Say><Hangup/>`));
        }
    });

    // ── Step 2: Menu choice ─────────────────────────────────────────────
    r.post('/voice/menu-choice', async (req: Request, res: Response) => {
        const digit = req.body.Digits;
        const from = String(req.query.from || normalizeCallerPhone(req.body.From));

        if (digit === '1') {
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'ask-name', { from, attempt: '0' })}</Redirect>`
            ));
        } else {
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'incoming', {})}</Redirect>`
            ));
        }
    });

    // ── Step 3: Ask for name (with retry logic) ─────────────────────────
    r.post('/voice/ask-name', async (req: Request, res: Response) => {
        const from = String(req.query.from || '');
        const attempt = parseInt(String(req.query.attempt || '0'), 10);

        if (attempt >= 3) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'voice.speech_exhausted', loc: loc(req) }));
            res.type('text/xml').send(twiml(
                `<Say>We're having trouble hearing you. Please try joining our waitlist online instead. Goodbye.</Say><Hangup/>`
            ));
            return;
        }

        const prompt = attempt === 0
            ? 'Please say your name after the beep.'
            : 'Sorry, I didn\'t catch that. Please say your name clearly after the beep.';

        // Speech recognition tuning (works on all paid Twilio accounts):
        // - speechTimeout="auto" — Twilio's adaptive silence detection (more reliable than a fixed 2s)
        // - language="en-US" — explicit, ensures correct model
        // - No finishOnKey — let auto silence detection end recording naturally
        // - actionOnEmptyResult="true" — still post on no input so we can retry
        // - input="speech" only — DTMF on this step caused confusion with the prompt
        res.type('text/xml').send(twiml(`
<Gather input="speech" language="en-US" timeout="8" speechTimeout="auto" actionOnEmptyResult="true" action="${action(req, 'got-name', { from, attempt: String(attempt) })}">
  <Say>${prompt}</Say>
</Gather>
<Say>Something went wrong. Goodbye.</Say>
<Hangup/>`));
    });

    // ── Step 4: Process speech result ────────────────────────────────────
    r.post('/voice/got-name', async (req: Request, res: Response) => {
        const speechResult = req.body.SpeechResult || '';
        const confidence = parseFloat(req.body.Confidence || '0');
        const from = String(req.query.from || '');
        const attempt = parseInt(String(req.query.attempt || '0'), 10);

        // Verbose logging for production debugging — log all Twilio fields when result is empty
        if (!speechResult) {
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'warn',
                msg: 'voice.speech_empty',
                loc: loc(req),
                attempt,
                bodyKeys: Object.keys(req.body),
                callStatus: req.body.CallStatus,
                from: req.body.From ? `******${String(req.body.From).slice(-4)}` : null,
                hasSpeechResult: 'SpeechResult' in req.body,
            }));
        } else {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'voice.speech_result', loc: loc(req), speech: speechResult, confidence, attempt }));
        }

        // Accept any non-empty result; Twilio confidence can be unreliable for names
        if (!speechResult) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'voice.speech_retry', loc: loc(req), reason: 'empty', attempt }));
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'ask-name', { from, attempt: String(attempt + 1) })}</Redirect>`
            ));
            return;
        }

        const name = speechResult.replace(/\.\s*$/, '').trim();

        res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="10" action="${action(req, 'got-size', { from, name })}">
  <Say>Thanks, ${escXml(name)}. How many guests in your party? Enter the number on your keypad, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
    });

    // ── Step 5: Process party size ───────────────────────────────────────
    r.post('/voice/got-size', async (req: Request, res: Response) => {
        const digits = req.body.Digits || '';
        const from = String(req.query.from || '');
        const name = String(req.query.name || '');
        const size = parseInt(digits, 10);

        if (isNaN(size) || size < 1 || size > 10) {
            res.type('text/xml').send(twiml(
                `<Say>Sorry, please enter a number between 1 and 10. Goodbye.</Say><Hangup/>`
            ));
            return;
        }

        if (size > 10) {
            // Transfer to front desk for large parties
            const location = await getLocation(loc(req));
            const frontDesk = location?.frontDeskPhone;
            if (frontDesk) {
                console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'voice.transfer', loc: loc(req), reason: 'large_party', size }));
                res.type('text/xml').send(twiml(
                    `<Say>For parties larger than 10, let me connect you with our host. Please hold.</Say><Dial>+1${frontDesk}</Dial>`
                ));
            } else {
                res.type('text/xml').send(twiml(
                    `<Say>For large parties, please contact us directly. Goodbye.</Say><Hangup/>`
                ));
            }
            return;
        }

        // Confirm phone number
        if (from) {
            const phoneReadback = spellOutPhone(from);
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" numDigits="1" timeout="10" action="${action(req, 'confirm-phone', { from, name, size: String(size) })}">
  <Say>We'll send a text confirmation to ${phoneReadback}. Is that correct? Press 1 for yes, or press 2 to enter a different number.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
        } else {
            // No caller ID — ask for phone
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="15" action="${action(req, 'join', { name, size: String(size) })}">
  <Say>We weren't able to detect your phone number. Please enter your 10 digit phone number on the keypad, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
        }
    });

    // ── Step 6: Confirm or enter new phone ──────────────────────────────
    r.post('/voice/confirm-phone', async (req: Request, res: Response) => {
        const digit = req.body.Digits;
        const from = String(req.query.from || '');
        const name = String(req.query.name || '');
        const size = String(req.query.size || '');

        if (digit === '1') {
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'join', { phone: from, name, size })}</Redirect>`
            ));
        } else {
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="15" action="${action(req, 'join', { name, size })}">
  <Say>Please enter your 10 digit phone number on the keypad, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
        }
    });

    // ── Step 7: Join the waitlist ────────────────────────────────────────
    r.post('/voice/join', async (req: Request, res: Response) => {
        const phone = String(req.query.phone || req.body.Digits || '');
        const name = String(req.query.name || '');
        const size = parseInt(String(req.query.size || '1'), 10);

        if (!/^\d{10}$/.test(phone)) {
            res.type('text/xml').send(twiml(
                `<Say>Sorry, that doesn't look like a valid phone number. Please try joining online instead. Goodbye.</Say><Hangup/>`
            ));
            return;
        }

        try {
            const result = await joinQueue(loc(req), { name, partySize: size, phone });
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'voice.join.complete', loc: loc(req), code: result.code, position: result.position, partySize: size }));

            // Fire-and-forget SMS confirmation
            const statusUrl = `${baseUrl(req)}/r/${loc(req)}/queue?code=${result.code}`;
            sendSms(phone, joinConfirmationMessage(result.code, statusUrl))
                .catch(e => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'voice.sms_confirm_failed', error: e instanceof Error ? e.message : String(e) })));

            const codeReadback = spellOutCode(result.code);
            res.type('text/xml').send(twiml(
                `<Say>You're all set! You are number ${result.position} in line. Your estimated wait is about ${result.etaMinutes} minutes. Your pickup code is ${codeReadback}. We'll send you a text message with your code and a link to track your place in line. Thank you for calling!</Say><Hangup/>`
            ));
        } catch (err) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'voice.join.error', loc: loc(req), error: err instanceof Error ? err.message : String(err) }));
            res.type('text/xml').send(twiml(
                `<Say>We're sorry, we're experiencing a technical issue. Please try joining our waitlist online or call back in a few minutes. Goodbye.</Say><Hangup/>`
            ));
        }
    });

    return r;
}
