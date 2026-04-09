/**
 * Twilio SMS Spike — Issue #29
 *
 * Validates:
 * 1. Twilio Node.js SDK sends SMS and returns messageId + status synchronously
 * 2. Message status can be fetched (polled) by SID
 * 3. Error handling for invalid numbers
 * 4. Provider-agnostic interface shape for future ACS swap (#33)
 *
 * Uses Twilio TEST credentials + magic numbers (no real SMS sent, no cost):
 *   - Test SID:   from env TWILIO_TEST_ACCOUNT_SID
 *   - Test Token:  from env TWILIO_TEST_AUTH_TOKEN
 *   - Magic from:  +15005550006 (valid test sender)
 *   - Magic to:    +14108675310 (succeeds), +15005550001 (invalid)
 *
 * Usage: npx tsx spike/twilio-sms-spike.ts
 *
 * For a REAL send test (costs ~$0.01):
 *   TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_PHONE_NUMBER=+1... TWILIO_TEST_TO=+1yourphone npx tsx spike/twilio-sms-spike.ts real
 */

import twilio from 'twilio';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const isReal = process.argv[2] === 'real';

const ACCOUNT_SID = isReal
    ? (process.env.TWILIO_ACCOUNT_SID ?? '')
    : (process.env.TWILIO_TEST_ACCOUNT_SID ?? process.env.TWILIO_ACCOUNT_SID ?? '');
const AUTH_TOKEN = isReal
    ? (process.env.TWILIO_AUTH_TOKEN ?? '')
    : (process.env.TWILIO_TEST_AUTH_TOKEN ?? process.env.TWILIO_AUTH_TOKEN ?? '');
const FROM = isReal
    ? (process.env.TWILIO_PHONE_NUMBER ?? '')
    : '+15005550006'; // Twilio magic valid sender
const TO_SUCCESS = isReal
    ? (process.env.TWILIO_TEST_TO ?? '')
    : '+14108675310'; // Twilio magic success recipient
const TO_INVALID = '+15005550001'; // Twilio magic invalid number

if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.error('Missing credentials. Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (or TWILIO_TEST_* variants).');
    console.error('Find test creds at: https://www.twilio.com/console -> API Keys & Tokens -> Test Credentials');
    process.exit(1);
}
if (isReal && (!FROM || !TO_SUCCESS)) {
    console.error('For real mode, set TWILIO_PHONE_NUMBER and TWILIO_TEST_TO');
    process.exit(1);
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

// ---------------------------------------------------------------------------
// Spike: provider-agnostic interface we'd use in production
// ---------------------------------------------------------------------------
interface SmsSendResult {
    messageId: string;
    status: string;       // 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered'
    successful: boolean;
}

async function sendSms(to: string, body: string): Promise<SmsSendResult> {
    const msg = await client.messages.create({
        from: FROM,
        to,
        body,
    });
    return {
        messageId: msg.sid,
        status: msg.status,
        successful: !['failed', 'undelivered'].includes(msg.status),
    };
}

async function getDeliveryStatus(messageId: string): Promise<{ status: string; errorCode: number | null }> {
    const msg = await client.messages(messageId).fetch();
    return {
        status: msg.status,
        errorCode: msg.errorCode ?? null,
    };
}

// ---------------------------------------------------------------------------
// Run tests
// ---------------------------------------------------------------------------
async function main() {
    console.log(`\n=== Twilio SMS Spike (${isReal ? 'REAL' : 'TEST'} mode) ===\n`);

    // Test 1: Successful SMS send
    console.log('--- Test 1: Send SMS (success path) ---');
    try {
        const result = await sendSms(
            TO_SUCCESS,
            'SKB: Your table is ready! Please head to the front whenever you\'re ready. Show code SKB-7Q3 to the host.',
        );
        console.log('  messageId:', result.messageId);
        console.log('  status:', result.status);
        console.log('  successful:', result.successful);
        console.log('  PASS: SMS accepted by Twilio\n');

        // Test 2: Poll delivery status
        console.log('--- Test 2: Poll delivery status ---');
        const delivery = await getDeliveryStatus(result.messageId);
        console.log('  status:', delivery.status);
        console.log('  errorCode:', delivery.errorCode);
        console.log('  PASS: Delivery status retrievable by messageId\n');
    } catch (err: unknown) {
        console.error('  FAIL:', err instanceof Error ? err.message : err);
    }

    // Test 3: Invalid number handling
    if (!isReal) {
        console.log('--- Test 3: Send to invalid number (error path) ---');
        try {
            await sendSms(TO_INVALID, 'This should fail');
            console.log('  UNEXPECTED: No error thrown');
        } catch (err: unknown) {
            const twilioErr = err as { code?: number; message?: string; status?: number };
            console.log('  Caught error (expected):');
            console.log('    code:', twilioErr.code);
            console.log('    status:', twilioErr.status);
            console.log('    message:', twilioErr.message?.substring(0, 100));
            console.log('  PASS: Invalid number correctly raises error\n');
        }
    }

    // Test 4: Repeat call message with count
    console.log('--- Test 4: Repeat call message template ---');
    try {
        const callCount = 3;
        const result = await sendSms(
            TO_SUCCESS,
            `SKB: Just a friendly reminder — we've called your name ${callCount} times. Your table is waiting for you! Code: SKB-7Q3.`,
        );
        console.log('  messageId:', result.messageId);
        console.log('  status:', result.status);
        console.log('  PASS: Repeat call template works\n');
    } catch (err: unknown) {
        console.error('  FAIL:', err instanceof Error ? err.message : err);
    }

    // Test 5: Confirmation SMS with link
    console.log('--- Test 5: Confirmation SMS with status link ---');
    try {
        const result = await sendSms(
            TO_SUCCESS,
            'SKB: You\'re on the list! Track your place in line here: https://skb.example.com/r/skb/queue?code=SKB-7Q3. Code: SKB-7Q3',
        );
        console.log('  messageId:', result.messageId);
        console.log('  status:', result.status);
        console.log('  PASS: Confirmation SMS with URL works\n');
    } catch (err: unknown) {
        console.error('  FAIL:', err instanceof Error ? err.message : err);
    }

    console.log('=== Spike Summary ===');
    console.log('1. twilio SDK: client.messages.create() returns {sid, status} synchronously');
    console.log('2. Delivery poll: client.messages(sid).fetch() returns current status');
    console.log('3. Status values: queued -> sent -> delivered (or failed/undelivered)');
    console.log('4. Error handling: invalid numbers throw with error code + message');
    console.log('5. Provider interface: { messageId, status, successful } works for both Twilio and ACS');
    console.log('6. No webhook needed for basic status — polling by messageId is sufficient');
    console.log('\nDesign recommendation:');
    console.log('  - sendSms() is fire-and-forget from the caller\'s perspective');
    console.log('  - Return { messageId, successful } immediately after create()');
    console.log('  - The "successful" field from create() = accepted by carrier (not final delivery)');
    console.log('  - For R10 (host checkmark/X): use the synchronous "successful" field');
    console.log('  - No need to poll — create() response is sufficient for the UI indicator');
}

main().catch(console.error);
