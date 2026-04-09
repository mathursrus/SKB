// Quick standalone debug — no test framework
process.env.MONGODB_DB_NAME = 'skb_voice_standalone';
delete process.env.TWILIO_AUTH_TOKEN;

import express from 'express';
import http from 'http';
import { voiceRouter } from '../../src/routes/voice.js';
import { queueRouter } from '../../src/routes/queue.js';
import { ensureLocation } from '../../src/services/locations.js';
import { closeDb, getDb, queueEntries } from '../../src/core/db/mongo.js';

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

    const CALL = { From: '+15127753555', To: '+18449172762', CallSid: 'CAdebug' };
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

    // 2. Press 1
    const a1 = extractAction(r1.body);
    const r2 = await post(port, a1, { ...CALL, Digits: '1' });
    check('Press1 redirects to ask-name', r2.body.includes('ask-name'));

    // 3. Ask name
    const a2 = extractAction(r2.body);
    const r3 = await post(port, a2, CALL);
    check('AskName has speech dtmf', r3.body.includes('speech dtmf'));
    check('AskName has pound', r3.body.includes('press pound'));

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

    // 7. Join
    const r7 = await post(port, a6, CALL);
    check('Join says all set', r7.body.includes('all set'));
    check('Join has position', r7.body.includes('number 1'));
    check('Join has hangup', r7.body.includes('Hangup'));

    // Verify DB
    const entry = await queueEntries(db).findOne({ name: 'Sid Mathur' });
    check('DB has entry', entry !== null);
    check('DB partySize=3', entry?.partySize === 3);
    check('DB phone correct', entry?.phone === '5127753555');

    // XSS
    const rx = await post(port, a3, { ...CALL, SpeechResult: '<script>alert(1)</script>', Confidence: '0.9' });
    check('XSS escaped', rx.body.includes('&lt;script&gt;'));
    check('XSS no raw script', !rx.body.includes('<script>alert'));

    // Empty speech retry
    const re = await post(port, a3, { ...CALL, SpeechResult: '', Confidence: '0' });
    check('Empty speech retries', re.body.includes('Redirect') && extractAction(re.body).includes('attempt=1'));

    console.log(`\n${pass} passed, ${fail} failed`);
    server.close();
    await closeDb();
    process.exit(fail > 0 ? 1 : 0);
});
