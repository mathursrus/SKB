// Unit tests for src/services/codes.ts
import { runTests } from '../test-utils.js';
import {
    CODE_ALPHABET,
    generateCode,
    isValidCodeFormat,
} from '../../src/services/codes.js';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const cases: T[] = [
    {
        name: 'generateCode has SKB- prefix and 3-char suffix',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const c = generateCode();
            return c.startsWith('SKB-') && c.length === 7;
        },
    },
    {
        name: 'generateCode suffix uses only unambiguous alphabet',
        tags: ['unit', 'codes'],
        testFn: async () => {
            for (let i = 0; i < 50; i++) {
                const c = generateCode();
                for (let j = 4; j < 7; j++) {
                    if (!CODE_ALPHABET.includes(c[j])) return false;
                }
            }
            return true;
        },
    },
    {
        name: 'isValidCodeFormat accepts freshly generated codes',
        tags: ['unit', 'codes'],
        testFn: async () => {
            for (let i = 0; i < 20; i++) {
                if (!isValidCodeFormat(generateCode())) return false;
            }
            return true;
        },
    },
    {
        name: 'isValidCodeFormat rejects malformed codes',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const bad = ['SKB-7Q', 'skb-7Q3', 'XYZ-7Q3', 'SKB-0Q3', 'SKB-7Q31', '', 'SKB7Q3'];
            return bad.every((c) => !isValidCodeFormat(c));
        },
    },
    {
        name: 'generateCode has reasonable variability (no all-same suffix over 100 tries)',
        tags: ['unit', 'codes'],
        testFn: async () => {
            const seen = new Set<string>();
            for (let i = 0; i < 100; i++) seen.add(generateCode());
            return seen.size > 50; // loose bound
        },
    },
];

void runTests(cases, 'codes service');
