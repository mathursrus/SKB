// Unit tests for redactName() — public waitlist privacy helper (R3)
import { runTests } from '../test-utils.js';
import { redactName } from '../../src/services/nameRedact.js';

const cases = [
    {
        name: 'redactName handles "Last, First" format',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName('Patel, Sana') === 'Sana P.',
    },
    {
        name: 'redactName handles "First Last" format',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName('Sana Patel') === 'Sana P.',
    },
    {
        name: 'redactName keeps single-token names as-is (capitalized)',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName('sana') === 'Sana',
    },
    {
        name: 'redactName uses the LAST token as the last initial (middle name case)',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName('Sana M Patel') === 'Sana P.',
    },
    {
        name: 'redactName falls back to "Guest" for empty input',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName('') === 'Guest',
    },
    {
        name: 'redactName falls back to "Guest" for null input',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName(null) === 'Guest',
    },
    {
        name: 'redactName falls back to "Guest" for whitespace-only input',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName('   ') === 'Guest',
    },
    {
        name: 'redactName handles "Last, First Middle" (takes first token of first name)',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName('Patel, Sana Marie') === 'Sana P.',
    },
    {
        name: 'redactName capitalizes lowercase names',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => redactName('jae kim') === 'Jae K.',
    },
    {
        name: 'redactName never leaks a full surname in "First Last" form',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => {
            const out = redactName('Jonathan Smithsonian-Blackwell');
            return out === 'Jonathan S.' && !out.includes('mithsonian');
        },
    },
    {
        name: 'redactName never leaks a full surname in "Last, First" form',
        tags: ['unit', 'waitlist', 'redact'],
        testFn: async () => {
            const out = redactName('Smithsonian-Blackwell, Jonathan');
            return out === 'Jonathan S.' && !out.includes('mithsonian');
        },
    },
    // Coverage: "comma form with empty-before-comma" branch returns just the first name
    {
        name: 'redactName "comma, First" returns just the capitalized first name',
        tags: ['unit', 'waitlist', 'redact', 'coverage'],
        testFn: async () => redactName(', priya') === 'Priya',
    },
    // Coverage: "comma form with both halves blank" → Guest
    {
        name: 'redactName bare-comma string falls back to Guest',
        tags: ['unit', 'waitlist', 'redact', 'coverage'],
        testFn: async () => redactName(', ') === 'Guest',
    },
    {
        name: 'redactName whitespace-only raw falls back to Guest',
        tags: ['unit', 'waitlist', 'redact', 'coverage'],
        testFn: async () => redactName('   ') === 'Guest',
    },
    {
        name: 'redactName null falls back to Guest',
        tags: ['unit', 'waitlist', 'redact', 'coverage'],
        testFn: async () => redactName(null) === 'Guest',
    },
    {
        name: 'redactName undefined falls back to Guest',
        tags: ['unit', 'waitlist', 'redact', 'coverage'],
        testFn: async () => redactName(undefined) === 'Guest',
    },
];

void runTests(cases, 'nameRedact');
