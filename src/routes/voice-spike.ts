// ============================================================================
// SKB - Voice IVR Spike — full waitlist integration
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { getQueueState, joinQueue } from '../services/queue.js';
import { getLocation } from '../services/locations.js';
import { sendSms } from '../services/sms.js';
import { joinConfirmationMessage } from '../services/smsTemplates.js';

function loc(req: Request): string {
    return String(req.params.loc ?? 'skb');
}

function twiml(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

function normalizePhone(from: string | undefined): string {
    if (!from) return '';
    const cleaned = from.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) return cleaned.slice(1);
    return cleaned;
}

function spellOut(str: string): string {
    return str.split('').map(ch => ch === '-' ? 'dash' : ch).join(', ');
}

/** Escape XML special characters to prevent TwiML injection */
function escXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function action(req: Request, path: string, params: Record<string, string> = {}): string {
    const qs = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&amp;');
    return `/r/${loc(req)}/api/voice/${path}${qs ? '?' + qs : ''}`;
}

export function voiceSpikeRouter(): Router {
    const r = Router({ mergeParams: true });

    // ── Step 1: Greeting + Menu ─────────────────────────────────────────
    r.post('/voice/spike', async (req: Request, res: Response) => {
        const from = normalizePhone(req.body.From);
        console.log('[SPIKE] /voice/spike | From:', from);
        try {
            const state = await getQueueState(loc(req));
            const location = await getLocation(loc(req));
            const name = location?.name ?? 'the restaurant';
            const eta = state.etaForNewPartyMinutes <= 0
                ? 'less than a minute'
                : `about ${state.etaForNewPartyMinutes} minutes`;

            res.type('text/xml').send(twiml(`
<Gather input="dtmf" numDigits="1" timeout="10" action="${action(req, 'spike-menu', { from })}">
  <Say voice="Polly.Joanna">Hello, and thank you for calling ${name}! There are currently ${state.partiesWaiting} parties ahead of you, with an estimated wait of ${eta}. To add your name to the waitlist, press 1. To hear the wait time again, press 2.</Say>
</Gather>
<Say>We didn't receive any input. Thank you for calling. Goodbye.</Say>
<Hangup/>`));
        } catch (err) {
            console.error('[SPIKE] Error:', err);
            res.type('text/xml').send(twiml(`<Say>We're experiencing a technical issue. Goodbye.</Say><Hangup/>`));
        }
    });

    // ── Step 2: Menu choice ─────────────────────────────────────────────
    r.post('/voice/spike-menu', async (req: Request, res: Response) => {
        const digit = req.body.Digits;
        const from = String(req.query.from || normalizePhone(req.body.From));
        console.log('[SPIKE] /voice/spike-menu | Digits:', digit);

        if (digit === '1') {
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'spike-ask-name', { from, attempt: '0' })}</Redirect>`
            ));
        } else {
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'spike', {})}</Redirect>`
            ));
        }
    });

    // ── Step 3: Ask for name ────────────────────────────────────────────
    r.post('/voice/spike-ask-name', async (req: Request, res: Response) => {
        const from = String(req.query.from || '');
        const attempt = parseInt(String(req.query.attempt || '0'), 10);
        console.log('[SPIKE] /voice/spike-ask-name | attempt:', attempt);

        if (attempt >= 3) {
            res.type('text/xml').send(twiml(
                `<Say>We're having trouble hearing you. Please try joining our waitlist online instead. Goodbye.</Say><Hangup/>`
            ));
            return;
        }

        const prompt = attempt === 0
            ? 'Please say your name, then press pound.'
            : 'Sorry, I didn\'t catch that. Please say your name clearly, then press pound.';

        // input="speech dtmf" — speech is captured, # terminates immediately
        // speechTimeout="2" — if they don't press #, 2s silence also ends it
        res.type('text/xml').send(twiml(`
<Gather input="speech dtmf" timeout="8" speechTimeout="2" finishOnKey="#" actionOnEmptyResult="true" action="${action(req, 'spike-got-name', { from, attempt: String(attempt) })}">
  <Say>${prompt}</Say>
</Gather>
<Say>Something went wrong. Goodbye.</Say>
<Hangup/>`));
    });

    // ── Step 4: Process speech result ────────────────────────────────────
    r.post('/voice/spike-got-name', async (req: Request, res: Response) => {
        const speechResult = req.body.SpeechResult || '';
        const confidence = parseFloat(req.body.Confidence || '0');
        const from = String(req.query.from || '');
        const attempt = parseInt(String(req.query.attempt || '0'), 10);

        console.log('[SPIKE] /voice/spike-got-name | speech:', JSON.stringify(speechResult),
            '| confidence:', confidence, '| attempt:', attempt);

        if (!speechResult || confidence < 0.3) {
            console.log('[SPIKE] → Retrying (empty or low confidence)');
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'spike-ask-name', { from, attempt: String(attempt + 1) })}</Redirect>`
            ));
            return;
        }

        const name = speechResult.replace(/\.\s*$/, '').trim();
        console.log('[SPIKE] → Accepted name:', name);

        res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="10" action="${action(req, 'spike-got-size', { from, name })}">
  <Say>Thanks, ${escXml(name)}. How many guests in your party? Enter the number on your keypad, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
    });

    // ── Step 5: Process party size → confirm phone → JOIN QUEUE ─────────
    r.post('/voice/spike-got-size', async (req: Request, res: Response) => {
        const digits = req.body.Digits || '';
        const from = String(req.query.from || '');
        const name = String(req.query.name || '');

        console.log('[SPIKE] /voice/spike-got-size | digits:', digits, '| name:', name, '| from:', from);

        const size = parseInt(digits, 10);
        if (isNaN(size) || size < 1 || size > 10) {
            res.type('text/xml').send(twiml(
                `<Say>Sorry, please enter a number between 1 and 10. Goodbye.</Say><Hangup/>`
            ));
            return;
        }

        // Confirm phone number
        if (from) {
            const phoneReadback = spellOut(from);
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" numDigits="1" timeout="10" action="${action(req, 'spike-confirm-phone', { from, name, size: String(size) })}">
  <Say>We'll send a text confirmation to ${phoneReadback}. Is that correct? Press 1 for yes, or press 2 to enter a different number.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
        } else {
            // No caller ID — ask for phone
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="15" action="${action(req, 'spike-join', { name, size: String(size) })}">
  <Say>We weren't able to detect your phone number. Please enter your 10 digit phone number on the keypad, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
        }
    });

    // ── Step 6: Confirm or enter new phone ──────────────────────────────
    r.post('/voice/spike-confirm-phone', async (req: Request, res: Response) => {
        const digit = req.body.Digits;
        const from = String(req.query.from || '');
        const name = String(req.query.name || '');
        const size = String(req.query.size || '');

        console.log('[SPIKE] /voice/spike-confirm-phone | digit:', digit);

        if (digit === '1') {
            // Confirmed — join with caller ID phone
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'spike-join', { phone: from, name, size })}</Redirect>`
            ));
        } else {
            // Enter different number
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="15" action="${action(req, 'spike-join', { name, size })}">
  <Say>Please enter your 10 digit phone number on the keypad, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
        }
    });

    // ── Step 7: JOIN THE ACTUAL WAITLIST ─────────────────────────────────
    r.post('/voice/spike-join', async (req: Request, res: Response) => {
        const phone = String(req.query.phone || req.body.Digits || '');
        const name = String(req.query.name || '');
        const size = parseInt(String(req.query.size || '1'), 10);

        console.log('[SPIKE] /voice/spike-join | name:', name, '| size:', size, '| phone:', phone);

        if (!/^\d{10}$/.test(phone)) {
            res.type('text/xml').send(twiml(
                `<Say>Sorry, that doesn't look like a valid phone number. Please try joining online instead. Goodbye.</Say><Hangup/>`
            ));
            return;
        }

        try {
            const result = await joinQueue(loc(req), { name, partySize: size, phone });
            console.log('[SPIKE] ✅ JOINED QUEUE | code:', result.code, '| position:', result.position, '| eta:', result.etaMinutes, 'min');

            // Fire-and-forget SMS confirmation
            const statusUrl = `https://393f-73-42-205-123.ngrok-free.app/r/${loc(req)}/queue?code=${result.code}`;
            sendSms(phone, joinConfirmationMessage(result.code, statusUrl))
                .then(r => console.log('[SPIKE] SMS result:', r.status))
                .catch(e => console.error('[SPIKE] SMS error:', e));

            const codeReadback = spellOut(result.code);
            res.type('text/xml').send(twiml(
                `<Say>You're all set! You are number ${result.position} in line. Your estimated wait is about ${result.etaMinutes} minutes. Your pickup code is ${codeReadback}. We'll send you a text message with your code and a link to track your place in line. Thank you for calling!</Say><Hangup/>`
            ));
        } catch (err) {
            console.error('[SPIKE] Join error:', err);
            res.type('text/xml').send(twiml(
                `<Say>We're sorry, we're experiencing a technical issue. Please try joining our waitlist online or call back in a few minutes. Goodbye.</Say><Hangup/>`
            ));
        }
    });

    return r;
}
