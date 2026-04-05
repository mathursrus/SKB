// Unit tests for HMAC-signed host cookie verification
import { runTests } from './test-utils.js';
import { verifyCookie, __test__ } from '../src/middleware/hostAuth.js';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const KEY = 'test-secret-0123456789';

const cases: T[] = [
    {
        name: 'freshly minted cookie verifies true',
        tags: ['unit', 'auth'],
        testFn: async () => {
            const cookie = __test__.mintCookie(new Date(), KEY);
            return verifyCookie(cookie, KEY);
        },
    },
    {
        name: 'cookie signed with wrong key verifies false',
        tags: ['unit', 'auth'],
        testFn: async () => {
            const cookie = __test__.mintCookie(new Date(), KEY);
            return !verifyCookie(cookie, 'different-key');
        },
    },
    {
        name: 'tampered cookie (flipped char) verifies false',
        tags: ['unit', 'auth'],
        testFn: async () => {
            const cookie = __test__.mintCookie(new Date(), KEY);
            const dot = cookie.indexOf('.');
            const mac = cookie.slice(dot + 1);
            const flipped = mac[0] === 'a' ? 'b' + mac.slice(1) : 'a' + mac.slice(1);
            const tampered = cookie.slice(0, dot + 1) + flipped;
            return !verifyCookie(tampered, KEY);
        },
    },
    {
        name: 'expired cookie verifies false',
        tags: ['unit', 'auth'],
        testFn: async () => {
            // Mint a cookie "now", verify with a "now" one day later.
            const cookie = __test__.mintCookie(new Date(), KEY);
            const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
            return !verifyCookie(cookie, KEY, future);
        },
    },
    {
        name: 'malformed cookie verifies false',
        tags: ['unit', 'auth'],
        testFn: async () => {
            return (
                !verifyCookie('garbage', KEY) &&
                !verifyCookie('', KEY) &&
                !verifyCookie('.nodot', KEY) &&
                !verifyCookie('123.short', KEY)
            );
        },
    },
    {
        name: 'readCookie finds skb_host among other cookies',
        tags: ['unit', 'auth'],
        testFn: async () => {
            const header = 'foo=bar; skb_host=abc.def; baz=qux';
            return __test__.readCookie(header) === 'abc.def';
        },
    },
    {
        name: 'readCookie returns null without header',
        tags: ['unit', 'auth'],
        testFn: async () => __test__.readCookie(undefined) === null,
    },
];

void runTests(cases, 'host auth (cookie)');
