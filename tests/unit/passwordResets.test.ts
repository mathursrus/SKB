// ============================================================================
// Unit tests for src/services/passwordResets.ts (pure helpers only)
// ============================================================================
//
// DB-backed create/consume live in the integration suite. Here we cover
// the token-generation + hashing + reset-link shape.

import { runTests, type BaseTestCase } from '../test-utils.js';
import { generateResetToken, hashToken, buildResetLink } from '../../src/services/passwordResets.js';

const cases: BaseTestCase[] = [
    {
        name: 'generateResetToken: token is base64url, hash is 64 hex chars',
        tags: ['unit', 'auth', 'password-reset'],
        testFn: async () => {
            const { token, tokenHash } = generateResetToken();
            return /^[A-Za-z0-9_-]+$/.test(token)
                && token.length >= 40
                && /^[0-9a-f]{64}$/.test(tokenHash);
        },
    },
    {
        name: 'generateResetToken: hashToken(token) matches the returned tokenHash',
        tags: ['unit', 'auth', 'password-reset'],
        testFn: async () => {
            const { token, tokenHash } = generateResetToken();
            return hashToken(token) === tokenHash;
        },
    },
    {
        name: 'generateResetToken: two calls yield distinct tokens (randomness sanity)',
        tags: ['unit', 'auth', 'password-reset'],
        testFn: async () => {
            const a = generateResetToken();
            const b = generateResetToken();
            return a.token !== b.token && a.tokenHash !== b.tokenHash;
        },
    },
    {
        name: 'buildResetLink: uses PLATFORM_PUBLIC_URL when set, url-encodes token',
        tags: ['unit', 'auth', 'password-reset'],
        testFn: async () => {
            const saved = process.env.PLATFORM_PUBLIC_URL;
            process.env.PLATFORM_PUBLIC_URL = 'https://app.example.com';
            try {
                const link = buildResetLink('abc+/=def');
                return link === 'https://app.example.com/reset-password?t=abc%2B%2F%3Ddef';
            } finally {
                if (saved === undefined) delete process.env.PLATFORM_PUBLIC_URL;
                else process.env.PLATFORM_PUBLIC_URL = saved;
            }
        },
    },
    {
        name: 'buildResetLink: falls back to relative URL when env missing',
        tags: ['unit', 'auth', 'password-reset'],
        testFn: async () => {
            const saved = process.env.PLATFORM_PUBLIC_URL;
            delete process.env.PLATFORM_PUBLIC_URL;
            try {
                return buildResetLink('xyz') === '/reset-password?t=xyz';
            } finally {
                if (saved !== undefined) process.env.PLATFORM_PUBLIC_URL = saved;
            }
        },
    },
];

void runTests(cases, 'password resets (unit)');
