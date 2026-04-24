// Unit tests for validateMessagingConfigUpdate (#69).
import { runTests } from '../test-utils.js';
import { validateMessagingConfigUpdate } from '../../src/services/locations.js';

function rejects(update: Parameters<typeof validateMessagingConfigUpdate>[0], pattern: RegExp): boolean {
    try {
        validateMessagingConfigUpdate(update);
        return false;
    } catch (err) {
        return err instanceof Error && pattern.test(err.message);
    }
}

function accepts(update: Parameters<typeof validateMessagingConfigUpdate>[0]): boolean {
    try {
        validateMessagingConfigUpdate(update);
        return true;
    } catch {
        return false;
    }
}

const cases = [
    { name: 'accepts a typical display name', tags: ['unit', 'sms'], testFn: async () =>
        accepts({ smsSenderName: 'Shri Krishna Bhavan' }) },
    { name: 'accepts name with ampersand/hyphen/apostrophe/period', tags: ['unit', 'sms'], testFn: async () =>
        accepts({ smsSenderName: "Joe's Pizza & Co." }) && accepts({ smsSenderName: 'Bellevue-Pizza' }) },
    { name: 'accepts undefined (no-op update)', tags: ['unit', 'sms'], testFn: async () =>
        accepts({}) },
    { name: 'accepts null (clears the field)', tags: ['unit', 'sms'], testFn: async () =>
        accepts({ smsSenderName: null }) },
    { name: 'accepts exactly 30 characters', tags: ['unit', 'sms'], testFn: async () =>
        accepts({ smsSenderName: 'X'.repeat(30) }) },
    { name: 'rejects empty / whitespace-only string', tags: ['unit', 'sms'], testFn: async () =>
        rejects({ smsSenderName: '' }, /blank/) && rejects({ smsSenderName: '   ' }, /blank/) },
    { name: 'rejects 31+ character name', tags: ['unit', 'sms'], testFn: async () =>
        rejects({ smsSenderName: 'X'.repeat(31) }, /30 characters or fewer/) },
    { name: 'rejects emoji', tags: ['unit', 'sms'], testFn: async () =>
        rejects({ smsSenderName: 'Shri Krishna 🙏' }, /letters, numbers, spaces/) },
    { name: 'rejects extended Unicode (accented chars)', tags: ['unit', 'sms'], testFn: async () =>
        rejects({ smsSenderName: 'Café Belle' }, /letters, numbers, spaces/) },
    { name: 'rejects disallowed punctuation', tags: ['unit', 'sms'], testFn: async () =>
        rejects({ smsSenderName: 'Pizza!' }, /letters, numbers, spaces/) &&
        rejects({ smsSenderName: 'Pizza@Place' }, /letters, numbers, spaces/) },
];

void runTests(cases, 'Messaging config validation');
