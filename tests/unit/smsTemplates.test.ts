// Unit tests for SMS message templates
import { runTests } from '../test-utils.js';
import {
    joinConfirmationMessage,
    firstCallMessage,
    repeatCallMessage,
    chatAlmostReadyMessage,
    chatNeedMoreTimeMessage,
    chatLostYouMessage,
} from '../../src/services/smsTemplates.js';

const cases = [
    {
        name: 'joinConfirmationMessage includes code and status URL',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const msg = joinConfirmationMessage('SKB-7Q3', 'https://skb.app/r/skb/queue?code=SKB-7Q3');
            return (
                msg.includes('SKB-7Q3') &&
                msg.includes('https://skb.app/r/skb/queue?code=SKB-7Q3') &&
                msg.startsWith('SKB:')
            );
        },
    },
    {
        name: 'firstCallMessage includes code and table-ready language',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const msg = firstCallMessage('SKB-ABC');
            return (
                msg.includes('SKB-ABC') &&
                msg.includes('table is ready') &&
                msg.startsWith('SKB:')
            );
        },
    },
    {
        name: 'repeatCallMessage includes call count and friendly tone',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const msg = repeatCallMessage('SKB-XYZ', 3);
            return (
                msg.includes('3 times') &&
                msg.includes('SKB-XYZ') &&
                msg.includes('friendly reminder')
            );
        },
    },
    {
        name: 'repeatCallMessage with count 2',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const msg = repeatCallMessage('SKB-AAA', 2);
            return msg.includes('2 times');
        },
    },
    // --- Chat quick-reply templates (R10) ---
    {
        name: 'chatAlmostReadyMessage includes code and "almost ready"',
        tags: ['unit', 'sms', 'chat'],
        testFn: async () => {
            const msg = chatAlmostReadyMessage('SKB-ALM');
            return msg.startsWith('SKB:')
                && msg.includes('SKB-ALM')
                && /almost ready/i.test(msg)
                && /5 more minutes/i.test(msg);
        },
    },
    {
        name: 'chatNeedMoreTimeMessage includes code and YES-reply ask',
        tags: ['unit', 'sms', 'chat'],
        testFn: async () => {
            const msg = chatNeedMoreTimeMessage('SKB-NMT');
            return msg.startsWith('SKB:')
                && msg.includes('SKB-NMT')
                && /more minutes/i.test(msg)
                && /Reply YES/.test(msg);
        },
    },
    {
        name: 'chatLostYouMessage includes code and YES-reply ask',
        tags: ['unit', 'sms', 'chat'],
        testFn: async () => {
            const msg = chatLostYouMessage('SKB-LST');
            return msg.startsWith('SKB:')
                && msg.includes('SKB-LST')
                && /didn't see you/i.test(msg)
                && /Reply YES/.test(msg);
        },
    },
];

void runTests(cases, 'SMS Templates');
