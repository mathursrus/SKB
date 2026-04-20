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
import { buildQueueStatusUrlForSms } from '../services/queueStatusUrl.js';
import {
    escXml,
    formatEtaForSpeech,
    formatEtaWallClock,
    normalizeCallerPhone,
    spellOutCode,
    spellOutPhone,
} from '../services/voiceTemplates.js';
import {
    formatAddressForSpeech,
    formatWeeklyHoursForSpeech,
    MENU_OVERVIEW_SCRIPT,
    HOURS_LOCATION_FALLBACK_SCRIPT,
} from '../services/location-template.js';
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
  <Say voice="Polly.Joanna">Hello, and thank you for calling ${escXml(name)}! There are currently ${state.partiesWaiting} parties ahead of you, with an estimated wait of ${eta}. To join the waitlist, press 1. To hear the wait time again, press 2. For our menu, press 3. For hours and location, press 4. To speak with someone at the restaurant, press 0.</Say>
</Gather>
<Say>We didn't receive any input. Thank you for calling. Goodbye.</Say>
<Hangup/>`));
        } catch (err) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'voice.incoming.error', error: err instanceof Error ? err.message : String(err) }));
            res.type('text/xml').send(twiml(`<Say>We're experiencing a technical issue. Please try again later. Goodbye.</Say><Hangup/>`));
        }
    });

    // ── Step 2: Menu choice ─────────────────────────────────────────────
    // Routes the caller based on the digit pressed at the main menu (and at
    // re-prompts from the /voice/menu-info and /voice/hours-info branches,
    // which post back here for '*' return and '1' short-circuit to join).
    r.post('/voice/menu-choice', async (req: Request, res: Response) => {
        const digit = req.body.Digits;
        const from = String(req.query.from || normalizeCallerPhone(req.body.From));

        if (digit === '1') {
            // Join the waitlist (existing flow, unchanged)
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'ask-name', { from, attempt: '0' })}</Redirect>`
            ));
            return;
        }
        if (digit === '3') {
            // Menu overview (issue #45)
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'menu-info', { from })}</Redirect>`
            ));
            return;
        }
        if (digit === '4') {
            // Hours + location (issue #45)
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'hours-info', { from })}</Redirect>`
            ));
            return;
        }
        if (digit === '0') {
            // Front-desk transfer (issue #45)
            res.type('text/xml').send(twiml(
                `<Redirect>${action(req, 'front-desk', { from })}</Redirect>`
            ));
            return;
        }
        // digit === '2', '*' (star returns to main menu), or anything else →
        // replay the greeting with the current queue state.
        res.type('text/xml').send(twiml(
            `<Redirect>${action(req, 'incoming', {})}</Redirect>`
        ));
    });

    // ── New branch: Menu overview (press 3) ──────────────────────────────
    // Speaks a short category overview and points the caller to the website
    // for item-level detail. Star returns to the main menu; 1 short-circuits
    // to the join-waitlist flow; anything else goes back to the main menu.
    r.post('/voice/menu-info', async (req: Request, res: Response) => {
        const from = String(req.query.from || normalizeCallerPhone(req.body.From));
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'voice.menu_info', loc: loc(req) }));
        res.type('text/xml').send(twiml(`
<Gather input="dtmf" numDigits="1" timeout="8" action="${action(req, 'menu-choice', { from })}">
  <Say voice="Polly.Joanna">${escXml(MENU_OVERVIEW_SCRIPT)} To return to the main menu, press star. To join the waitlist, press 1.</Say>
</Gather>
<Say>Thank you for calling. Goodbye.</Say>
<Hangup/>`));
    });

    // ── New branch: Hours and location (press 4) ─────────────────────────
    // Renders the hours+address script from the per-location admin-config
    // (address + hours). Falls back to a static default when either field
    // is unset. Star returns to the main menu; 1 short-circuits to join.
    r.post('/voice/hours-info', async (req: Request, res: Response) => {
        const from = String(req.query.from || normalizeCallerPhone(req.body.From));
        try {
            const location = await getLocation(loc(req));
            const name = location?.name ?? 'the restaurant';
            const addressSpeech = formatAddressForSpeech(location?.address);
            const hoursSpeech = formatWeeklyHoursForSpeech(location?.hours);
            let script: string;
            if (addressSpeech && hoursSpeech) {
                script = `${name} is located at ${addressSpeech}. ${hoursSpeech} Complimentary parking is available in the lot at our building.`;
            } else {
                // Fallback when admin hasn't configured address or hours yet.
                // The fallback string is the owner-confirmed literal from the
                // spec, so the IVR still works on day 0.
                script = HOURS_LOCATION_FALLBACK_SCRIPT;
            }
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'voice.hours_info', loc: loc(req), hasConfig: !!(addressSpeech && hoursSpeech) }));
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" numDigits="1" timeout="8" action="${action(req, 'menu-choice', { from })}">
  <Say voice="Polly.Joanna">${escXml(script)} To return to the main menu, press star. To join the waitlist, press 1.</Say>
</Gather>
<Say>Thank you for calling. Goodbye.</Say>
<Hangup/>`));
        } catch (err) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'voice.hours_info.error', error: err instanceof Error ? err.message : String(err) }));
            res.type('text/xml').send(twiml(`<Say>We're experiencing a technical issue. Please try again later. Goodbye.</Say><Hangup/>`));
        }
    });

    // ── New branch: Front-desk transfer (press 0) ────────────────────────
    // Dials the per-location `frontDeskPhone` configured via the host admin
    // UI. Falls back to a graceful message + redirect to main menu if the
    // phone is unset — rather than hanging up on the caller.
    r.post('/voice/front-desk', async (req: Request, res: Response) => {
        const from = String(req.query.from || normalizeCallerPhone(req.body.From));
        try {
            const location = await getLocation(loc(req));
            const frontDesk = location?.frontDeskPhone;
            if (frontDesk && /^\d{10}$/.test(frontDesk)) {
                console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'voice.front_desk_transfer', loc: loc(req) }));
                res.type('text/xml').send(twiml(
                    `<Say voice="Polly.Joanna">Connecting you to our host. Please hold.</Say><Dial>+1${frontDesk}</Dial>`
                ));
                return;
            }
            // Fallback: front-desk phone not configured yet.
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'voice.front_desk_unconfigured', loc: loc(req) }));
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" numDigits="1" timeout="8" action="${action(req, 'menu-choice', { from })}">
  <Say voice="Polly.Joanna">Our host is currently unavailable. To join the waitlist, press 1. To hear our menu, press 3. To return to the main menu, press star.</Say>
</Gather>
<Say>Thank you for calling. Goodbye.</Say>
<Hangup/>`));
        } catch (err) {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'voice.front_desk.error', error: err instanceof Error ? err.message : String(err) }));
            res.type('text/xml').send(twiml(`<Say>We're experiencing a technical issue. Please try again later. Goodbye.</Say><Hangup/>`));
        }
    });

    // ── Step 3: Ask for name (with retry + fallback) ─────────────────────
    // The voice IVR depends on Twilio speech recognition, which is unreliable
    // on Trial accounts and on accounts that don't have premium speech enabled.
    // After 2 failed attempts, we fall back to using the caller's phone number
    // as a temporary name (e.g. "Caller 3555") so the call still completes.
    r.post('/voice/ask-name', async (req: Request, res: Response) => {
        const from = String(req.query.from || '');
        const attempt = parseInt(String(req.query.attempt || '0'), 10);

        if (attempt >= 2) {
            // Fallback: use last 4 of phone as a placeholder name. The host can
            // rename the party at the door if needed.
            const last4 = from ? from.slice(-4) : 'unknown';
            const fallbackName = `Caller ${last4}`;
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'voice.speech_fallback', loc: loc(req), fallbackName }));
            res.type('text/xml').send(twiml(`
<Say>I'm having trouble hearing you. I'll add you to the waitlist as "Caller ${last4}". You can update your name when you arrive.</Say>
<Redirect>${action(req, 'got-size-prompt', { from, name: fallbackName })}</Redirect>`));
            return;
        }

        const prompt = attempt === 0
            ? 'Please say your full name.'
            : 'Sorry, I didn\'t catch that. Please say your full name now.';

        // Speech recognition config:
        // - input="speech" ONLY — DTMF + finishOnKey was making Twilio interpret
        //   the whole interaction as DTMF and skip speech transcription entirely
        //   (confirmed from prod logs: SpeechResult was missing from req.body).
        // - speechTimeout="auto" — Twilio's adaptive silence detection ends the
        //   gather after ~1s of silence after the user finishes speaking.
        // - language="en-US" — explicit
        // - actionOnEmptyResult="true" — still post on no input so we can retry/fallback
        res.type('text/xml').send(twiml(`
<Gather input="speech" language="en-US" timeout="6" speechTimeout="auto" actionOnEmptyResult="true" action="${action(req, 'got-name', { from, attempt: String(attempt) })}">
  <Say>${prompt}</Say>
</Gather>
<Redirect>${action(req, 'ask-name', { from, attempt: String(attempt + 1) })}</Redirect>`));
    });

    // ── Step 4: Process speech result ────────────────────────────────────
    r.post('/voice/got-name', async (req: Request, res: Response) => {
        const speechResult = req.body.SpeechResult || '';
        const confidence = parseFloat(req.body.Confidence || '0');
        const from = String(req.query.from || '');
        const attempt = parseInt(String(req.query.attempt || '0'), 10);

        // Verbose logging for production debugging — log full body (values too)
        // when SpeechResult is empty so we can see exactly what Twilio sent.
        if (!speechResult) {
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'warn',
                msg: 'voice.speech_empty',
                loc: loc(req),
                attempt,
                hasSpeechResult: 'SpeechResult' in req.body,
                speechResultRaw: req.body.SpeechResult ?? null,
                confidence: req.body.Confidence ?? null,
                callStatus: req.body.CallStatus,
                digits: req.body.Digits,
                finishedOnKey: req.body.FinishedOnKey,
                bodyKeys: Object.keys(req.body),
            }));
        } else {
            console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'voice.speech_result', loc: loc(req), speech: speechResult, confidence, attempt }));
        }

        // Empty result → retry (or fall back to "Caller XXXX" after 2 attempts)
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

    // ── Step 4b: Prompt for size after fallback name ─────────────────────
    // Used by the speech-fallback path when speech recognition fails twice
    // and we assigned a "Caller XXXX" placeholder name. Same prompt as the
    // success path in got-name.
    r.post('/voice/got-size-prompt', async (req: Request, res: Response) => {
        const from = String(req.query.from || '');
        const name = String(req.query.name || '');
        res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="10" action="${action(req, 'got-size', { from, name })}">
  <Say>How many guests in your party? Enter the number on your keypad, then press pound.</Say>
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

    // ── Step 6: Confirm caller-ID phone or start "different number" flow ─
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
            // User wants a different phone — gather digits, then read back
            // and confirm via /voice/confirm-new-phone before joining.
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="15" action="${action(req, 'confirm-new-phone', { name, size })}">
  <Say>Please enter your 10 digit phone number on the keypad, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
        }
    });

    // ── Step 6b: Read back the entered phone and ask for confirmation ────
    r.post('/voice/confirm-new-phone', async (req: Request, res: Response) => {
        const name = String(req.query.name || '');
        const size = String(req.query.size || '');
        // First arrival: req.body.Digits is the just-entered phone, no Confirm query
        // Second arrival: req.query.phone is the phone, req.body.Digits is 1 or 2
        const confirmDigit = req.body.Digits;
        const phoneFromQuery = String(req.query.phone || '');

        if (phoneFromQuery) {
            // We are confirming a previously-read-back number
            if (confirmDigit === '1') {
                res.type('text/xml').send(twiml(
                    `<Redirect>${action(req, 'join', { phone: phoneFromQuery, name, size })}</Redirect>`
                ));
                return;
            }
            // Press 2 (or anything else) → re-enter
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="15" action="${action(req, 'confirm-new-phone', { name, size })}">
  <Say>Okay, please enter your 10 digit phone number again, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
            return;
        }

        // First arrival: validate the gathered phone, then read back
        const enteredPhone = (req.body.Digits || '').replace(/\D/g, '');
        if (!/^\d{10}$/.test(enteredPhone)) {
            // Re-prompt on bad input
            res.type('text/xml').send(twiml(`
<Gather input="dtmf" finishOnKey="#" timeout="15" action="${action(req, 'confirm-new-phone', { name, size })}">
  <Say>Sorry, that wasn't a valid 10 digit number. Please enter your 10 digit phone number, then press pound.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
            return;
        }

        const readback = spellOutPhone(enteredPhone);
        res.type('text/xml').send(twiml(`
<Gather input="dtmf" numDigits="1" timeout="10" action="${action(req, 'confirm-new-phone', { name, size, phone: enteredPhone })}">
  <Say>I heard ${readback}. Press 1 to confirm, or press 2 to enter a different number.</Say>
</Gather>
<Say>No input received. Goodbye.</Say>
<Hangup/>`));
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
            const location = await getLocation(loc(req));
            const statusUrl = buildQueueStatusUrlForSms({
                locationId: loc(req),
                code: result.code,
                requestProto: String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https'),
                requestHost: String(req.headers['x-forwarded-host'] ?? req.headers.host ?? ''),
                locationPublicUrl: location?.publicUrl ?? '',
                appPublicBaseUrl: process.env.SKB_PUBLIC_BASE_URL ?? '',
            });
            sendSms(phone, joinConfirmationMessage(result.code, statusUrl))
                .catch(e => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'voice.sms_confirm_failed', error: e instanceof Error ? e.message : String(e) })));

            const codeReadback = spellOutCode(result.code);
            const wallClock = formatEtaWallClock(result.etaAt);
            const etaSpeech = formatEtaForSpeech(result.etaMinutes);
            // Friendly, personalized goodbye. The "name" can be the spoken
            // name from speech recognition or a "Caller XXXX" fallback —
            // either way, addressing the caller by their identifier feels
            // more personal than a generic "you".
            res.type('text/xml').send(twiml(
                `<Say>Thanks ${escXml(name)}! You're number ${result.position} in line. Your estimated wait is ${etaSpeech} — that's around ${wallClock}. Your pickup code is ${codeReadback}. We'll text you with your code and a link to track your place. See you soon!</Say><Hangup/>`
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
