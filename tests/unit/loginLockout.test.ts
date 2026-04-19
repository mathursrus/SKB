// ============================================================================
// Unit tests for src/middleware/loginLockout.ts
// ============================================================================

import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    checkAllowed,
    recordFailure,
    recordSuccess,
    __resetForTests,
    LOGIN_MAX_ATTEMPTS,
} from '../../src/middleware/loginLockout.js';

const cases: BaseTestCase[] = [
    {
        name: 'fresh email is allowed',
        tags: ['unit', 'auth', 'lockout'],
        testFn: async () => {
            __resetForTests();
            return checkAllowed('nobody@example.com').allowed === true;
        },
    },
    {
        name: 'below threshold: still allowed',
        tags: ['unit', 'auth', 'lockout'],
        testFn: async () => {
            __resetForTests();
            for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) recordFailure('a@b.co');
            return checkAllowed('a@b.co').allowed === true;
        },
    },
    {
        name: 'at threshold: recordFailure returns allowed=false and locks',
        tags: ['unit', 'auth', 'lockout'],
        testFn: async () => {
            __resetForTests();
            let last: { allowed: boolean } = { allowed: true };
            for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) last = recordFailure('a@b.co');
            return last.allowed === false && checkAllowed('a@b.co').allowed === false;
        },
    },
    {
        name: 'recordSuccess clears the bucket',
        tags: ['unit', 'auth', 'lockout'],
        testFn: async () => {
            __resetForTests();
            recordFailure('c@d.co');
            recordFailure('c@d.co');
            recordSuccess('c@d.co');
            return checkAllowed('c@d.co').allowed === true;
        },
    },
    {
        name: 'email normalized: different case same bucket',
        tags: ['unit', 'auth', 'lockout'],
        testFn: async () => {
            __resetForTests();
            for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) recordFailure('Sid@Example.COM');
            // Lookup with differently-cased string — same bucket.
            const r = checkAllowed('  SID@example.COM  ');
            return r.allowed === false;
        },
    },
    {
        name: 'empty email: always allowed (no-op)',
        tags: ['unit', 'auth', 'lockout'],
        testFn: async () => {
            __resetForTests();
            for (let i = 0; i < LOGIN_MAX_ATTEMPTS + 2; i++) recordFailure('');
            return checkAllowed('').allowed === true;
        },
    },
    {
        name: 'different emails tracked independently',
        tags: ['unit', 'auth', 'lockout'],
        testFn: async () => {
            __resetForTests();
            for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) recordFailure('loser@example.com');
            return checkAllowed('winner@example.com').allowed === true
                && checkAllowed('loser@example.com').allowed === false;
        },
    },
];

void runTests(cases, 'login lockout (unit)');
