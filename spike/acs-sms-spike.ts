/**
 * ACS SMS Spike — Issue #29
 *
 * Tests:
 * 1. Search for available toll-free phone numbers
 * 2. Purchase a toll-free number
 * 3. Send an SMS
 * 4. Poll delivery status via messageId
 *
 * Usage: npx tsx spike/acs-sms-spike.ts <step> [args]
 *   step 1: search     — search available toll-free numbers
 *   step 2: purchase   — purchase the first available number
 *   step 3: send <to>  — send a test SMS to <to> (E.164 format, e.g. +12065551234)
 */

import { SmsClient } from '@azure/communication-sms';
import {
    PhoneNumbersClient,
    type SearchAvailablePhoneNumbersRequest,
} from '@azure/communication-phone-numbers';

const CONNECTION_STRING = process.env.ACS_CONNECTION_STRING ?? '';
if (!CONNECTION_STRING) {
    console.error('Set ACS_CONNECTION_STRING env var');
    process.exit(1);
}

const step = process.argv[2];

async function searchNumbers() {
    const client = new PhoneNumbersClient(CONNECTION_STRING);
    const searchRequest: SearchAvailablePhoneNumbersRequest = {
        countryCode: 'US',
        phoneNumberType: 'tollFree',
        assignmentType: 'application',
        capabilities: { sms: 'outbound', calling: 'none' },
    };
    console.log('Searching for toll-free numbers with outbound SMS...');
    const searchPoller = await client.beginSearchAvailablePhoneNumbers(searchRequest);
    const result = await searchPoller.pollUntilDone();
    console.log('Search ID:', result.searchId);
    console.log('Numbers found:', result.phoneNumbers);
    console.log('Cost:', result.cost, result.currencyCode);
    // Save searchId for purchase step
    console.log('\nTo purchase, run:');
    console.log(`  ACS_CONNECTION_STRING="..." npx tsx spike/acs-sms-spike.ts purchase ${result.searchId}`);
}

async function purchaseNumber(searchId: string) {
    if (!searchId) {
        console.error('Provide searchId as argument');
        process.exit(1);
    }
    const client = new PhoneNumbersClient(CONNECTION_STRING);
    console.log('Purchasing phone number from search:', searchId);
    const purchasePoller = await client.beginPurchasePhoneNumbers(searchId);
    await purchasePoller.pollUntilDone();
    console.log('Purchase complete!');

    // List purchased numbers
    console.log('\nListing purchased numbers:');
    const numbers = client.listPurchasedPhoneNumbers();
    for await (const num of numbers) {
        console.log(`  ${num.phoneNumber} (type: ${num.phoneNumberType}, sms: ${num.capabilities.sms})`);
    }
}

async function sendSms(to: string) {
    if (!to) {
        console.error('Provide recipient phone number in E.164 format (e.g. +12065551234)');
        process.exit(1);
    }

    // Get sender number from purchased numbers
    const phoneClient = new PhoneNumbersClient(CONNECTION_STRING);
    let from = '';
    for await (const num of phoneClient.listPurchasedPhoneNumbers()) {
        if (num.capabilities.sms === 'outbound' || num.capabilities.sms === 'inbound+outbound') {
            from = num.phoneNumber;
            break;
        }
    }
    if (!from) {
        console.error('No SMS-capable phone number found. Run search + purchase first.');
        process.exit(1);
    }

    console.log(`Sending SMS from ${from} to ${to}...`);
    const smsClient = new SmsClient(CONNECTION_STRING);

    const sendResults = await smsClient.send(
        {
            from,
            to: [to],
            message: 'SKB: Your table is ready! Please head to the front whenever you\'re ready. Show code SKB-7Q3 to the host.',
        },
        {
            enableDeliveryReport: true,
            tag: 'spike-test',
        },
    );

    for (const result of sendResults) {
        console.log('\n--- Send Result ---');
        console.log('  to:', result.to);
        console.log('  messageId:', result.messageId);
        console.log('  httpStatusCode:', result.httpStatusCode);
        console.log('  successful:', result.successful);
        if (!result.successful) {
            console.log('  errorMessage:', result.errorMessage);
        }
    }

    console.log('\n--- Spike Complete ---');
    console.log('Findings:');
    console.log('  1. SmsClient.send() returns messageId + success boolean synchronously');
    console.log('  2. enableDeliveryReport=true enables Event Grid delivery events');
    console.log('  3. For polling approach: use the messageId to query delivery status');
    console.log('  4. The successful field gives immediate send status (accepted by carrier)');
}

async function listNumbers() {
    const phoneClient = new PhoneNumbersClient(CONNECTION_STRING);
    console.log('Purchased phone numbers:');
    for await (const num of phoneClient.listPurchasedPhoneNumbers()) {
        console.log(`  ${num.phoneNumber} (type: ${num.phoneNumberType}, sms: ${num.capabilities.sms})`);
    }
}

// --- Main ---
(async () => {
    try {
        switch (step) {
            case 'search':
                await searchNumbers();
                break;
            case 'purchase':
                await purchaseNumber(process.argv[3]);
                break;
            case 'send':
                await sendSms(process.argv[3]);
                break;
            case 'list':
                await listNumbers();
                break;
            default:
                console.log('Usage: npx tsx spike/acs-sms-spike.ts <search|purchase|send|list> [args]');
        }
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
})();
