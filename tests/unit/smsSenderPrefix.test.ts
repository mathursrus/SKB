// Unit tests for the per-tenant SMS sender-name prefix (#69).
import { runTests } from '../test-utils.js';
import { applySenderPrefix, SMS_SENDER_FALLBACK_NAME } from '../../src/utils/smsSenderPrefix.js';

const cases = [
    {
        name: 'applies "<name>: " prefix to a bare body',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const out = applySenderPrefix('Your table is ready.', 'Shri Krishna Bhavan');
            return out === 'Shri Krishna Bhavan: Your table is ready.';
        },
    },
    {
        name: 'idempotent when body already starts with the prefix',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const bodyAlreadyPrefixed = 'Shri Krishna Bhavan: Your table is ready.';
            const out = applySenderPrefix(bodyAlreadyPrefixed, 'Shri Krishna Bhavan');
            return out === bodyAlreadyPrefixed;
        },
    },
    {
        name: 'falls back to "OSH" when senderName is undefined',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const out = applySenderPrefix('Hello.', undefined);
            return out === `${SMS_SENDER_FALLBACK_NAME}: Hello.`;
        },
    },
    {
        name: 'falls back to "OSH" when senderName is empty string',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const out = applySenderPrefix('Hello.', '');
            return out === 'OSH: Hello.';
        },
    },
    {
        name: 'falls back to "OSH" when senderName is whitespace',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const out = applySenderPrefix('Hello.', '   ');
            return out === 'OSH: Hello.';
        },
    },
    {
        name: 'trims senderName before prefixing',
        tags: ['unit', 'sms'],
        testFn: async () => {
            const out = applySenderPrefix('Hello.', '  Bellevue Pizza House  ');
            return out === 'Bellevue Pizza House: Hello.';
        },
    },
    {
        name: 'does not double-prefix when name collides with body start',
        tags: ['unit', 'sms'],
        testFn: async () => {
            // Body starts with "Bhavan: ..." but that's not the full display
            // name — the check is strict (full `${name}: ` prefix), so it
            // should still prefix.
            const out = applySenderPrefix('Bhavan: your table is ready', 'Shri Krishna Bhavan');
            return out === 'Shri Krishna Bhavan: Bhavan: your table is ready';
        },
    },
];

void runTests(cases, 'SMS sender prefix');
