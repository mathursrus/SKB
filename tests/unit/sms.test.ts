// Unit tests for SMS service — maskPhone + sendSms behavior
import { runTests } from '../test-utils.js';
import { maskPhone, sendSms } from '../../src/services/sms.js';

// Save and clear Twilio env vars to test not-configured path
const savedSid = process.env.TWILIO_ACCOUNT_SID;
const savedToken = process.env.TWILIO_AUTH_TOKEN;
const savedPhone = process.env.TWILIO_PHONE_NUMBER;

function clearTwilioEnv() {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
}

function setTwilioTestEnv() {
    // Uses real credentials from env vars (set in CI or local machine).
    // Falls back to Twilio magic test sender if credentials are available.
    if (!savedSid || !savedToken) return false;
    process.env.TWILIO_ACCOUNT_SID = savedSid;
    process.env.TWILIO_AUTH_TOKEN = savedToken;
    process.env.TWILIO_PHONE_NUMBER = '+15005550006'; // Twilio magic test sender
    return true;
}

function restoreTwilioEnv() {
    if (savedSid) process.env.TWILIO_ACCOUNT_SID = savedSid; else delete process.env.TWILIO_ACCOUNT_SID;
    if (savedToken) process.env.TWILIO_AUTH_TOKEN = savedToken; else delete process.env.TWILIO_AUTH_TOKEN;
    if (savedPhone) process.env.TWILIO_PHONE_NUMBER = savedPhone; else delete process.env.TWILIO_PHONE_NUMBER;
}

const cases = [
    // -- maskPhone tests --
    {
        name: 'maskPhone masks all but last 4 digits',
        tags: ['unit', 'sms'],
        testFn: async () => maskPhone('2065551234') === '******1234',
    },
    {
        name: 'maskPhone handles short input',
        tags: ['unit', 'sms'],
        testFn: async () => maskPhone('1234') === '******1234',
    },
    {
        name: 'maskPhone handles empty string',
        tags: ['unit', 'sms'],
        testFn: async () => maskPhone('') === '******',
    },

    // -- sendSms not-configured path --
    {
        name: 'sendSms returns not_configured when TWILIO env vars missing',
        tags: ['unit', 'sms'],
        testFn: async () => {
            clearTwilioEnv();
            try {
                const result = await sendSms('5127753555', 'Test message');
                return (
                    result.messageId === '' &&
                    result.status === 'not_configured' &&
                    result.successful === false
                );
            } finally {
                restoreTwilioEnv();
            }
        },
    },
    {
        name: 'sendSms returns not_configured when only partial env vars set',
        tags: ['unit', 'sms'],
        testFn: async () => {
            clearTwilioEnv();
            process.env.TWILIO_ACCOUNT_SID = 'ACtest';
            // Missing AUTH_TOKEN and PHONE_NUMBER
            try {
                const result = await sendSms('5127753555', 'Test message');
                return result.status === 'not_configured' && result.successful === false;
            } finally {
                restoreTwilioEnv();
            }
        },
    },

    // -- sendSms with Twilio test credentials --
    {
        name: 'sendSms returns successful with valid test credentials and magic number',
        tags: ['unit', 'sms', 'twilio-test'],
        testFn: async () => {
            const hasCredentials = setTwilioTestEnv();
            if (!hasCredentials) {
                // Skip if no Twilio credentials in environment — test passes vacuously
                console.log('  (skipped: no TWILIO_ACCOUNT_SID in env)');
                return true;
            }
            try {
                const result = await sendSms('4108675310', 'SKB: Test message');
                return (
                    result.messageId.startsWith('SM') &&
                    result.status === 'queued' &&
                    result.successful === true
                );
            } finally {
                restoreTwilioEnv();
            }
        },
    },
    {
        name: 'sendSms returns failed for invalid credentials',
        tags: ['unit', 'sms'],
        testFn: async () => {
            clearTwilioEnv();
            process.env.TWILIO_ACCOUNT_SID = 'ACinvalid000000000000000000000000';
            process.env.TWILIO_AUTH_TOKEN = 'invalid_token_value';
            process.env.TWILIO_PHONE_NUMBER = '+15005550006';
            try {
                const result = await sendSms('4108675310', 'Test');
                return result.successful === false && result.status === 'failed';
            } finally {
                restoreTwilioEnv();
            }
        },
    },
];

void runTests(cases, 'SMS Service');
