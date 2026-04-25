// Quick standalone debug — no test framework
process.env.MONGODB_DB_NAME = 'skb_voice_standalone';
delete process.env.TWILIO_AUTH_TOKEN;
// The signature middleware is now strict by default (BB-05 follow-up). Local
// tests that intentionally run without Twilio creds must opt in to the
// unsigned-request bypass.
process.env.SKB_ALLOW_UNSIGNED_TWILIO = '1';

import express from 'express';
import http from 'http';
import { voiceRouter } from '../../src/routes/voice.js';
import { queueRouter } from '../../src/routes/queue.js';
import { ensureLocation, updateLocationSiteConfig, updateLocationVoiceConfig } from '../../src/services/locations.js';
import { closeDb, getDb, queueEntries, voiceCallSessions } from '../../src/core/db/mongo.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/r/:loc/api', queueRouter());
app.use('/r/:loc/api', voiceRouter());

function post(port: number, path: string, body: Record<string, string>): Promise<{status: number; body: string}> {
    return new Promise((resolve, reject) => {
        const data = new URLSearchParams(body).toString();
        const req = http.request({ hostname: 'localhost', port, path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(data.length) } }, res => {
            let d = ''; res.on('data', (c: any) => d += c); res.on('end', () => resolve({ status: res.statusCode!, body: d }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function extractAction(xml: string): string {
    const m = xml.match(/action="([^"]*)"|<Redirect>([^<]*)<\/Redirect>/);
    return m ? (m[1] || m[2]).replace(/&amp;/g, '&') : '';
}

const server = app.listen(0, async () => {
    const port = (server.address() as any).port;
    console.log('Port:', port);

    const db = await getDb();
    await queueEntries(db).deleteMany({});
    await ensureLocation('test', 'Test Restaurant', '1234');
    // Seed address + hours via site-config, and frontDeskPhone via voice-config,
    // for issue #45 IVR branches.
    await updateLocationSiteConfig('test', {
        address: { street: '12 Bellevue Way SE', city: 'Bellevue', state: 'WA', zip: '98004' },
        hours: {
            mon: 'closed',
            tue: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            wed: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            thu: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            fri: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            sat: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            sun: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
        },
    });
    await updateLocationVoiceConfig('test', {
        frontDeskPhone: '2065551234',
        cateringPhone: '4255550199',
    });

    const CALL = { From: '+12025550199', To: '+18449172762', CallSid: 'CAdebug' };
    let pass = 0, fail = 0;

    function check(name: string, ok: boolean, detail?: string) {
        if (ok) { pass++; console.log('  ✅', name); }
        else { fail++; console.log('  ❌', name, detail || ''); }
    }

    // 1. Greeting
    const r1 = await post(port, '/r/test/api/voice/incoming', CALL);
    check('Greeting 200', r1.status === 200);
    check('Greeting has Response', r1.body.includes('<Response>'));
    check('Greeting has 0 parties', r1.body.includes('0 parties'), `body: ${r1.body.substring(0, 150)}`);
    // Issue #45: greeting advertises the new options 3/4/0
    check('Greeting advertises press 3 for menu', /For our menu, press 3/i.test(r1.body));
    check('Greeting advertises press 4 for hours and location', /For hours and location, press 4/i.test(r1.body));
    check('Greeting advertises press 5 for catering', /For catering, press 5/i.test(r1.body));
    check('Greeting advertises press 0 for front desk', /press 0/i.test(r1.body));

    // 2. Press 1
    const a1 = extractAction(r1.body);
    const r2 = await post(port, a1, { ...CALL, Digits: '1' });
    check('Press1 redirects to ask-name', r2.body.includes('ask-name'));

    // 3. Ask name — speech-only Gather (DTMF/finishOnKey caused Twilio to skip
    //    speech transcription entirely; see commit history & coaching moment)
    const a2 = extractAction(r2.body);
    const r3 = await post(port, a2, CALL);
    check('AskName has speech-only input', r3.body.includes('input="speech"') && !r3.body.includes('input="speech dtmf"'));
    check('AskName uses auto speech timeout', r3.body.includes('speechTimeout="auto"'));
    check('AskName explicit en-US language', r3.body.includes('language="en-US"'));
    check('AskName has no finishOnKey on speech step', !/<Gather[^>]*finishOnKey[^>]*input="speech"/.test(r3.body));
    // Prompt must not promise audio cues that don't actually play
    check('AskName prompt does not promise a beep', !/beep/i.test(r3.body));
    check('AskName prompt does not promise a tone', !/after the tone/i.test(r3.body));
    check('AskName prompt does not promise a # press', !/press pound/i.test(r3.body));

    // 4. Speech result
    const a3 = extractAction(r3.body);
    const r4 = await post(port, a3, { ...CALL, SpeechResult: 'Sid Mathur', Confidence: '0.85' });
    check('Speech echoes name', r4.body.includes('Sid Mathur'));
    check('Speech shows party size', r4.body.includes('How many'));

    // 5. Party size
    const a4 = extractAction(r4.body);
    const r5 = await post(port, a4, { ...CALL, Digits: '3' });
    check('Size shows phone confirm', r5.body.includes('Is that correct'));

    // 6. Confirm phone
    const a5 = extractAction(r5.body);
    const r6 = await post(port, a5, { ...CALL, Digits: '1' });
    const a6 = extractAction(r6.body);

    // 7. Join — personalized goodbye with wall-clock ETA
    const r7 = await post(port, a6, CALL);
    check('Join thanks user by name', r7.body.includes('Thanks Sid Mathur'));
    check('Join says see you soon', r7.body.includes('See you soon'));
    check('Join has position', r7.body.includes('number 1'));
    check('Join has minutes ETA', /Your estimated wait is/.test(r7.body));
    check('Join has wall-clock ETA (h:mm AM/PM)', /\d{1,2}:\d{2} (AM|PM)/.test(r7.body));
    check('Join has around', r7.body.includes('around'));
    check('Join has hangup', r7.body.includes('Hangup'));

    // Verify DB
    const entry = await queueEntries(db).findOne({ name: 'Sid Mathur' });
    check('DB has entry', entry !== null);
    check('DB partySize=3', entry?.partySize === 3);
    check('DB phone correct', entry?.phone === '2025550199');
    const voiceSession = await voiceCallSessions(db).findOne({ callSid: CALL.CallSid });
    check('Caller session persisted', voiceSession !== null);
    check('Caller session links joined waitlist outcome', voiceSession?.finalOutcome === 'joined_waitlist');
    check('Caller session stores queue code', voiceSession?.queueCode === entry?.code);
    check('Caller session stores caller ID source', voiceSession?.phoneSource === 'caller_id');
    check('Caller session stores join intent', voiceSession?.joinIntent === true);

    // XSS
    const rx = await post(port, a3, { ...CALL, SpeechResult: '<script>alert(1)</script>', Confidence: '0.9' });
    check('XSS escaped', rx.body.includes('&lt;script&gt;'));
    check('XSS no raw script', !rx.body.includes('<script>alert'));

    // Empty speech retry
    const re = await post(port, a3, { ...CALL, SpeechResult: '', Confidence: '0' });
    check('Empty speech retries', re.body.includes('Redirect') && extractAction(re.body).includes('attempt=1'));

    // Fallback flow: 2 failed attempts → use "Caller XXXX" placeholder name
    // Simulate the second failed attempt by hitting ask-name with attempt=2
    const askNameUrl = a2.replace(/attempt=\d+/, 'attempt=2');
    const rFallback = await post(port, askNameUrl, CALL);
    check('Fallback announces Caller placeholder', rFallback.body.includes('Caller 0199'));
    check('Fallback redirects to size prompt', rFallback.body.includes('got-size-prompt'));
    check('Fallback passes Caller name in query', rFallback.body.includes('Caller'));

    // Hit got-size-prompt directly to ensure it asks for party size
    const sizePromptUrl = extractAction(rFallback.body);
    const rSizePrompt = await post(port, sizePromptUrl, CALL);
    check('SizePrompt asks for guests', rSizePrompt.body.includes('How many guests'));

    // ── Different-number flow: confirm-phone press 2 → enter number → readback → press 1 → join
    // First, get back into confirm-phone by re-doing steps 1-5 (queue is now non-empty)
    const r1b = await post(port, '/r/test/api/voice/incoming', CALL);
    const r2b = await post(port, extractAction(r1b.body), { ...CALL, Digits: '1' });
    const r3b = await post(port, extractAction(r2b.body), CALL);
    const r4b = await post(port, extractAction(r3b.body), { ...CALL, SpeechResult: 'Jane Doe', Confidence: '0.9' });
    const r5b = await post(port, extractAction(r4b.body), { ...CALL, Digits: '2' });
    // Now press 2 ("different number") on confirm-phone
    const r6b = await post(port, extractAction(r5b.body), { ...CALL, Digits: '2' });
    check('ConfirmPhone press 2 prompts for new number', r6b.body.includes('enter your 10 digit phone'));
    check('ConfirmPhone press 2 routes to confirm-new-phone', r6b.body.includes('confirm-new-phone'));

    // Enter a new number
    const newPhoneEntryUrl = extractAction(r6b.body);
    const rNewEntry = await post(port, newPhoneEntryUrl, { ...CALL, Digits: '4255550123' });
    check('NewPhone reads back the number digit-by-digit',
        rNewEntry.body.includes('I heard 4, 2, 5, 5, 5, 5, 0, 1, 2, 3'));
    check('NewPhone asks Press 1 to confirm or 2 to re-enter', rNewEntry.body.includes('Press 1 to confirm'));

    // Press 2 → re-prompt for entry
    const readbackUrl = extractAction(rNewEntry.body);
    const rReenter = await post(port, readbackUrl, { ...CALL, Digits: '2' });
    check('NewPhone press 2 re-prompts for entry', rReenter.body.includes('enter your 10 digit'));

    // Press 1 → join with the new phone
    const rConfirmYes = await post(port, readbackUrl, { ...CALL, Digits: '1' });
    check('NewPhone press 1 redirects to join', rConfirmYes.body.includes('join'));

    // Bad input — non-10-digit → re-prompt
    const rBad = await post(port, newPhoneEntryUrl, { ...CALL, Digits: '12345' });
    check('NewPhone bad input re-prompts', rBad.body.includes('valid 10 digit'));

    // ── Issue #45: new branches ──────────────────────────────────────────
    // Helper: fresh greeting for each branch test
    async function greet() { return post(port, '/r/test/api/voice/incoming', CALL); }

    // Press 3 → menu info redirect → menu-info speaks the overview
    const gMenu = await greet();
    const mcAction = extractAction(gMenu.body);
    const r3menu = await post(port, mcAction, { ...CALL, Digits: '3' });
    check('Press 3 redirects to menu-info', r3menu.body.includes('menu-info'));
    const menuInfoUrl = extractAction(r3menu.body);
    const rMenuInfo = await post(port, menuInfoUrl, CALL);
    check('Menu-info mentions dosa varieties', rMenuInfo.body.includes('more than twenty varieties of dosa'));
    check('Menu-info points to skbbellevue.com', rMenuInfo.body.includes('skbbellevue dot com slash menu'));
    check('Menu-info prompts for star or 1', /return to the main menu, press star/i.test(rMenuInfo.body) && /join the waitlist, press 1/i.test(rMenuInfo.body));
    check('Menu-info has no recording', !/<Record/.test(rMenuInfo.body) && !/record="/.test(rMenuInfo.body));

    // Press 4 → hours info redirect → hours-info speaks the seeded hours+address
    const gHours = await greet();
    const hcAction = extractAction(gHours.body);
    const r4hours = await post(port, hcAction, { ...CALL, Digits: '4' });
    check('Press 4 redirects to hours-info', r4hours.body.includes('hours-info'));
    const hoursInfoUrl = extractAction(r4hours.body);
    const rHoursInfo = await post(port, hoursInfoUrl, CALL);
    check('Hours-info contains seeded street', rHoursInfo.body.includes('12 Bellevue Way SE'));
    check('Hours-info mentions Bellevue', rHoursInfo.body.includes('Bellevue'));
    check('Hours-info mentions closed Mondays', /closed on Mondays/i.test(rHoursInfo.body));
    check('Hours-info mentions Tuesday through Sunday', /Tuesday through Sunday/i.test(rHoursInfo.body));
    check('Hours-info mentions lunch 11:30', rHoursInfo.body.includes('11:30 AM'));
    check('Hours-info mentions dinner 5:30', rHoursInfo.body.includes('5:30 PM'));
    check('Hours-info mentions parking', rHoursInfo.body.includes('Complimentary parking'));
    check('Hours-info has no recording', !/<Record/.test(rHoursInfo.body) && !/record="/.test(rHoursInfo.body));

    // Issue #78: weekday/weekend schedules can differ. The IVR should group
    // the real configured windows instead of reading only the first open day.
    await updateLocationSiteConfig('test', {
        address: { street: '12 Bellevue Way SE', city: 'Bellevue', state: 'WA', zip: '98004' },
        hours: {
            mon: 'closed',
            tue: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            wed: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            thu: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            fri: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
            sat: {
                breakfast: { open: '09:00', close: '12:00' },
                special: { open: '12:30', close: '14:00' },
                dinner: { open: '17:30', close: '21:30' },
            },
            sun: {
                breakfast: { open: '09:00', close: '12:00' },
                special: { open: '12:30', close: '14:00' },
                dinner: { open: '17:30', close: '21:30' },
            },
        },
    });
    const rHoursSplit = await post(port, hoursInfoUrl, CALL);
    check('Hours-info groups weekday schedule separately', /Tuesday through Friday/i.test(rHoursSplit.body));
    check('Hours-info groups weekend schedule separately', /Saturday and Sunday/i.test(rHoursSplit.body));
    check('Hours-info mentions breakfast window when configured', rHoursSplit.body.includes('9:00 AM'));
    check('Hours-info mentions special window when configured', rHoursSplit.body.includes('12:30 PM'));

    // Press 0 → front-desk transfer Dial with seeded frontDeskPhone
    const gFront = await greet();
    const fcAction = extractAction(gFront.body);
    const r0front = await post(port, fcAction, { ...CALL, Digits: '0' });
    check('Press 0 redirects to front-desk', r0front.body.includes('front-desk'));
    const frontDeskUrl = extractAction(r0front.body);
    const rFrontDesk = await post(port, frontDeskUrl, CALL);
    check('Front-desk Dials seeded number', rFrontDesk.body.includes('<Dial>+12065551234</Dial>'));
    check('Front-desk announces connecting', /Connecting you to our host/i.test(rFrontDesk.body));

    // Press 5 → catering transfer Dial with seeded cateringPhone
    const gCatering = await greet();
    const catAction = extractAction(gCatering.body);
    const r5catering = await post(port, catAction, { ...CALL, Digits: '5' });
    check('Press 5 redirects to catering', /catering/i.test(r5catering.body));
    const cateringUrl = extractAction(r5catering.body);
    const rCatering = await post(port, cateringUrl, CALL);
    check('Catering Dials seeded number', rCatering.body.includes('<Dial>+14255550199</Dial>'));
    check('Catering announces connecting', /catering/i.test(rCatering.body) && /please hold/i.test(rCatering.body));

    // Press 0 fallback when frontDeskPhone is unset — clear it and re-test
    await updateLocationVoiceConfig('test', { frontDeskPhone: null });
    const rFrontDeskUnset = await post(port, frontDeskUrl, CALL);
    check('Front-desk unset announces unavailable', /Our host is currently unavailable/i.test(rFrontDeskUnset.body));
    check('Front-desk unset does NOT emit Dial', !rFrontDeskUnset.body.includes('<Dial>'));
    // Restore the seeded phone for subsequent tests
    await updateLocationVoiceConfig('test', { frontDeskPhone: '2065551234' });

    // Press 5 fallback when cateringPhone is unset — clear it and re-test
    await updateLocationVoiceConfig('test', { cateringPhone: null });
    const rCateringUnset = await post(port, cateringUrl, CALL);
    check('Catering unset announces unavailable', /catering/i.test(rCateringUnset.body) && /currently unavailable/i.test(rCateringUnset.body));
    check('Catering unset does NOT emit Dial', !rCateringUnset.body.includes('<Dial>'));
    const rNoCateringGreeting = await greet();
    check('Greeting hides press 5 when catering is unset', !/For catering, press 5/i.test(rNoCateringGreeting.body));
    // Restore the seeded phone for subsequent tests
    await updateLocationVoiceConfig('test', { cateringPhone: '4255550199' });

    // Hours-info fallback: clear address + hours, hours-info should use the static script
    await updateLocationSiteConfig('test', { address: null, hours: null });
    const rHoursFallback = await post(port, hoursInfoUrl, CALL);
    check('Hours-info fallback still mentions Bellevue Way', rHoursFallback.body.includes('12 Bellevue Way SE'));
    check('Hours-info fallback still says closed Mondays', /closed on Mondays/i.test(rHoursFallback.body));

    // Menu-choice with star ('*') returns to main menu
    const rStar = await post(port, mcAction, { ...CALL, Digits: '*' });
    check('Star returns to incoming', rStar.body.includes('incoming'));

    console.log(`\n${pass} passed, ${fail} failed`);
    server.close();
    await closeDb();
    process.exit(fail > 0 ? 1 : 0);
});
