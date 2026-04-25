import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    checkAllowed,
    recordFailure,
    recordSuccess,
    __resetForTests,
    PIN_LOCKOUT_MAX_ATTEMPTS,
} from '../../src/middleware/pinLockout.js';

const SCOPE = 'host-login';
const LOC = 'skb';
const IP = '127.0.0.1';

const cases: BaseTestCase[] = [
    {
        name: 'fresh scope/location/ip bucket is allowed',
        tags: ['unit', 'auth', 'lockout', 'security'],
        testFn: async () => {
            __resetForTests();
            return checkAllowed(SCOPE, LOC, IP).allowed === true;
        },
    },
    {
        name: 'below threshold remains allowed',
        tags: ['unit', 'auth', 'lockout', 'security'],
        testFn: async () => {
            __resetForTests();
            for (let i = 0; i < PIN_LOCKOUT_MAX_ATTEMPTS - 1; i++) {
                recordFailure(SCOPE, LOC, IP);
            }
            return checkAllowed(SCOPE, LOC, IP).allowed === true;
        },
    },
    {
        name: 'at threshold recordFailure locks the bucket',
        tags: ['unit', 'auth', 'lockout', 'security'],
        testFn: async () => {
            __resetForTests();
            let last = { allowed: true };
            for (let i = 0; i < PIN_LOCKOUT_MAX_ATTEMPTS; i++) {
                last = recordFailure(SCOPE, LOC, IP);
            }
            return last.allowed === false && checkAllowed(SCOPE, LOC, IP).allowed === false;
        },
    },
    {
        name: 'recordSuccess clears the scope/location/ip bucket',
        tags: ['unit', 'auth', 'lockout', 'security'],
        testFn: async () => {
            __resetForTests();
            recordFailure(SCOPE, LOC, IP);
            recordFailure(SCOPE, LOC, IP);
            recordSuccess(SCOPE, LOC, IP);
            return checkAllowed(SCOPE, LOC, IP).allowed === true;
        },
    },
    {
        name: 'different locations are tracked independently',
        tags: ['unit', 'auth', 'lockout', 'security'],
        testFn: async () => {
            __resetForTests();
            for (let i = 0; i < PIN_LOCKOUT_MAX_ATTEMPTS; i++) {
                recordFailure(SCOPE, 'loc-a', IP);
            }
            return checkAllowed(SCOPE, 'loc-b', IP).allowed === true
                && checkAllowed(SCOPE, 'loc-a', IP).allowed === false;
        },
    },
];

void runTests(cases, 'pin lockout (unit)');
