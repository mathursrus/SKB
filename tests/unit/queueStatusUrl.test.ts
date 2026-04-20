import { runTests } from '../test-utils.js';
import { buildQueueStatusUrlForSms, resolveQueueStatusBaseUrl } from '../../src/services/queueStatusUrl.js';

const cases = [
    {
        name: 'resolveQueueStatusBaseUrl prefers location public URL over request host',
        tags: ['unit', 'sms', 'waitlist'],
        testFn: async () => (
            resolveQueueStatusBaseUrl({
                locationId: 'skb',
                code: 'SKB-7Q3',
                requestProto: 'https',
                requestHost: 'osh.wellnessatwork.me',
                locationPublicUrl: 'https://skb-waitlist.azurewebsites.net',
                appPublicBaseUrl: 'https://fallback.example.com',
            }) === 'https://skb-waitlist.azurewebsites.net'
        ),
    },
    {
        name: 'resolveQueueStatusBaseUrl prefers app public base URL over request host when location URL is absent',
        tags: ['unit', 'sms', 'waitlist'],
        testFn: async () => (
            resolveQueueStatusBaseUrl({
                locationId: 'skb',
                code: 'SKB-7Q3',
                requestProto: 'https',
                requestHost: 'osh.wellnessatwork.me',
                appPublicBaseUrl: 'https://skb-waitlist.azurewebsites.net',
            }) === 'https://skb-waitlist.azurewebsites.net'
        ),
    },
    {
        name: 'resolveQueueStatusBaseUrl falls back to request host when no configured public URL exists',
        tags: ['unit', 'sms', 'waitlist'],
        testFn: async () => (
            resolveQueueStatusBaseUrl({
                locationId: 'skb',
                code: 'SKB-7Q3',
                requestProto: 'https',
                requestHost: 'osh.wellnessatwork.me',
            }) === 'https://osh.wellnessatwork.me'
        ),
    },
    {
        name: 'buildQueueStatusUrlForSms keeps the queue.html deep link shape',
        tags: ['unit', 'sms', 'waitlist'],
        testFn: async () => (
            buildQueueStatusUrlForSms({
                locationId: 'skb',
                code: 'SKB-7Q3',
                appPublicBaseUrl: 'https://skb-waitlist.azurewebsites.net',
            }) === 'https://skb-waitlist.azurewebsites.net/r/skb/queue.html?code=SKB-7Q3'
        ),
    },
];

void runTests(cases, 'Queue Status URL');
