// Unit tests for src/services/voiceTemplates.ts
import { runTests } from '../test-utils.js';
import {
    spellOutCode,
    spellOutPhone,
    formatEtaForSpeech,
    formatEtaWallClock,
    normalizeCallerPhone,
    escXml,
} from '../../src/services/voiceTemplates.js';

interface T { name: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const cases: T[] = [
    // spellOutCode
    {
        name: 'spellOutCode spells SKB-7Q3 with dash',
        tags: ['unit', 'voice'],
        testFn: async () => spellOutCode('SKB-7Q3') === 'S, K, B, dash, 7, Q, 3',
    },
    {
        name: 'spellOutCode handles single char',
        tags: ['unit', 'voice'],
        testFn: async () => spellOutCode('A') === 'A',
    },
    {
        name: 'spellOutCode handles empty string',
        tags: ['unit', 'voice'],
        testFn: async () => spellOutCode('') === '',
    },

    // spellOutPhone
    {
        name: 'spellOutPhone spells 10-digit number',
        tags: ['unit', 'voice'],
        testFn: async () => spellOutPhone('2065551234') === '2, 0, 6, 5, 5, 5, 1, 2, 3, 4',
    },
    {
        name: 'spellOutPhone strips +1 from 11-digit',
        tags: ['unit', 'voice'],
        testFn: async () => spellOutPhone('+12065551234') === '2, 0, 6, 5, 5, 5, 1, 2, 3, 4',
    },
    {
        name: 'spellOutPhone strips non-digits',
        tags: ['unit', 'voice'],
        testFn: async () => spellOutPhone('(206) 555-1234') === '2, 0, 6, 5, 5, 5, 1, 2, 3, 4',
    },

    // formatEtaForSpeech
    {
        name: 'formatEtaForSpeech: 0 → less than a minute',
        tags: ['unit', 'voice'],
        testFn: async () => formatEtaForSpeech(0) === 'less than a minute',
    },
    {
        name: 'formatEtaForSpeech: negative → less than a minute',
        tags: ['unit', 'voice'],
        testFn: async () => formatEtaForSpeech(-5) === 'less than a minute',
    },
    {
        name: 'formatEtaForSpeech: 1 → about 1 minute',
        tags: ['unit', 'voice'],
        testFn: async () => formatEtaForSpeech(1) === 'about 1 minute',
    },
    {
        name: 'formatEtaForSpeech: 48 → about 48 minutes',
        tags: ['unit', 'voice'],
        testFn: async () => formatEtaForSpeech(48) === 'about 48 minutes',
    },

    // formatEtaWallClock
    {
        name: 'formatEtaWallClock returns h:mm AM/PM in PT for a fixed UTC time',
        tags: ['unit', 'voice'],
        testFn: async () => {
            // 2026-04-10T19:42:00Z is 12:42 PM in PT (PDT, UTC-7) on April 10
            const prev = process.env.TZ;
            process.env.TZ = 'America/Los_Angeles';
            try {
                const out = formatEtaWallClock('2026-04-10T19:42:00Z');
                return out === '12:42 PM';
            } finally {
                if (prev === undefined) delete process.env.TZ;
                else process.env.TZ = prev;
            }
        },
    },
    {
        name: 'formatEtaWallClock formats midnight UTC as 5 PM PT (PDT)',
        tags: ['unit', 'voice'],
        testFn: async () => {
            const prev = process.env.TZ;
            process.env.TZ = 'America/Los_Angeles';
            try {
                const out = formatEtaWallClock('2026-04-11T00:00:00Z');
                return out === '5:00 PM';
            } finally {
                if (prev === undefined) delete process.env.TZ;
                else process.env.TZ = prev;
            }
        },
    },
    {
        name: 'formatEtaWallClock accepts a Date instance',
        tags: ['unit', 'voice'],
        testFn: async () => {
            const prev = process.env.TZ;
            process.env.TZ = 'America/Los_Angeles';
            try {
                const out = formatEtaWallClock(new Date('2026-04-10T19:42:00Z'));
                return /^\d{1,2}:\d{2} (AM|PM)$/.test(out);
            } finally {
                if (prev === undefined) delete process.env.TZ;
                else process.env.TZ = prev;
            }
        },
    },

    // normalizeCallerPhone
    {
        name: 'normalizeCallerPhone strips +1 from Twilio format',
        tags: ['unit', 'voice'],
        testFn: async () => normalizeCallerPhone('+12065551234') === '2065551234',
    },
    {
        name: 'normalizeCallerPhone keeps 10-digit as-is',
        tags: ['unit', 'voice'],
        testFn: async () => normalizeCallerPhone('2065551234') === '2065551234',
    },
    {
        name: 'normalizeCallerPhone returns empty for undefined',
        tags: ['unit', 'voice'],
        testFn: async () => normalizeCallerPhone(undefined) === '',
    },
    {
        name: 'normalizeCallerPhone returns empty for empty string',
        tags: ['unit', 'voice'],
        testFn: async () => normalizeCallerPhone('') === '',
    },
    {
        name: 'normalizeCallerPhone handles Anonymous',
        tags: ['unit', 'voice'],
        testFn: async () => normalizeCallerPhone('Anonymous') === '',
    },

    // escXml
    {
        name: 'escXml escapes < and >',
        tags: ['unit', 'voice'],
        testFn: async () => escXml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;',
    },
    {
        name: 'escXml escapes & and quotes',
        tags: ['unit', 'voice'],
        testFn: async () => escXml('a&b "c" \'d\'') === 'a&amp;b &quot;c&quot; &apos;d&apos;',
    },
    {
        name: 'escXml passes clean text through',
        tags: ['unit', 'voice'],
        testFn: async () => escXml('John Smith') === 'John Smith',
    },
    {
        name: 'escXml handles empty string',
        tags: ['unit', 'voice'],
        testFn: async () => escXml('') === '',
    },
];

runTests(cases, 'Voice Templates');
