// Unit tests for src/services/codes.ts
import { runTests } from '../test-utils.js';
import {
    CODE_ALPHABET,
    generateCode,
    isValidCodeFormat,
    prefixForLocation,
} from '../../src/services/codes.js';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const cases: T[] = [
    {
        name: 'generateCode(skb) preserves SKB- prefix and length 7 (G5)',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const c = generateCode('skb');
            return c.startsWith('SKB-') && c.length === 7;
        },
    },
    {
        name: 'generateCode(abcd) has ABCD- prefix (tenant-branded)',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const c = generateCode('abcd');
            return c.startsWith('ABCD-') && c.length === 8;
        },
    },
    {
        name: 'generateCode(ramen-yokocho) caps prefix at 4 chars (RAME-)',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const c = generateCode('ramen-yokocho');
            return c.startsWith('RAME-') && c.length === 8;
        },
    },
    {
        name: 'generateCode suffix uses only unambiguous alphabet',
        tags: ['unit', 'codes'],
        testFn: async () => {
            for (let i = 0; i < 50; i++) {
                const c = generateCode('skb');
                for (let j = 4; j < 7; j++) {
                    if (!CODE_ALPHABET.includes(c[j])) return false;
                }
            }
            return true;
        },
    },
    {
        name: 'isValidCodeFormat accepts freshly generated codes across tenants',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const locs = ['skb', 'abcd', 'ramen-yokocho', 'a'];
            for (const loc of locs) {
                for (let i = 0; i < 20; i++) {
                    if (!isValidCodeFormat(generateCode(loc))) return false;
                }
            }
            return true;
        },
    },
    {
        name: 'isValidCodeFormat rejects malformed codes',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const bad = ['SKB-7Q', 'skb-7Q3', 'SKB-0Q3', 'SKB-7Q31', '', 'SKB7Q3', '-7Q3', 'SKB-7q3'];
            return bad.every((c) => !isValidCodeFormat(c));
        },
    },
    {
        name: 'prefixForLocation strips non-alphanumerics and uppercases',
        tags: ['unit', 'codes'],
        testFn: async () => {
            return (
                prefixForLocation('skb') === 'SKB'
                && prefixForLocation('abcd') === 'ABCD'
                && prefixForLocation('ramen-yokocho') === 'RAME'
                && prefixForLocation('the-corner-seattle') === 'THEC'
                && prefixForLocation('a') === 'A'
            );
        },
    },
    {
        name: 'prefixForLocation falls back to R for degenerate slugs',
        tags: ['unit', 'codes'],
        testFn: async () => prefixForLocation('') === 'R' && prefixForLocation('---') === 'R',
    },
    {
        name: 'generateCode has reasonable variability (>50 unique over 100 tries)',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const seen = new Set<string>();
            for (let i = 0; i < 100; i++) seen.add(generateCode('skb'));
            return seen.size > 50;
        },
    },
];

void runTests(cases, 'codes service');
