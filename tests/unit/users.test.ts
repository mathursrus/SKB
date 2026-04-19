// ============================================================================
// Unit tests for src/services/users.ts
// ============================================================================
//
// Covers the pure-logic surface (validators, password hashing,
// toPublicUser projection). DB-backed helpers (createOwnerUser,
// listActiveMembershipsForUser) are exercised in the integration suite.

import { runTests, type BaseTestCase } from '../test-utils.js';
import { ObjectId } from 'mongodb';

import {
    normalizeEmail,
    validateEmail,
    validatePassword,
    validateName,
    hashPassword,
    verifyPassword,
    toPublicUser,
    toPublicMembership,
} from '../../src/services/users.js';
import type { User, Membership } from '../../src/types/identity.js';

const cases: BaseTestCase[] = [
    {
        name: 'normalizeEmail lowercases + trims',
        tags: ['unit', 'users'],
        testFn: async () => normalizeEmail('  Sid@Example.COM  ') === 'sid@example.com',
    },
    {
        name: 'validateEmail: accepts well-formed email',
        tags: ['unit', 'users'],
        testFn: async () => validateEmail('user@example.com') === 'user@example.com',
    },
    {
        name: 'validateEmail: rejects empty + whitespace',
        tags: ['unit', 'users'],
        testFn: async () => {
            try { validateEmail(''); return false; } catch { /* expected */ }
            try { validateEmail('   '); return false; } catch { /* expected */ }
            return true;
        },
    },
    {
        name: 'validateEmail: rejects strings without @ or dot',
        tags: ['unit', 'users'],
        testFn: async () => {
            try { validateEmail('not-an-email'); return false; } catch { /* expected */ }
            try { validateEmail('also@broken'); return false; } catch { /* expected */ }
            return true;
        },
    },
    {
        name: 'validatePassword: accepts 10+ chars',
        tags: ['unit', 'users'],
        testFn: async () => {
            validatePassword('1234567890');
            validatePassword('a-long-and-boring-password-that-is-fine');
            return true;
        },
    },
    {
        name: 'validatePassword: rejects <10 chars',
        tags: ['unit', 'users'],
        testFn: async () => {
            try { validatePassword('short'); return false; } catch { return true; }
        },
    },
    {
        name: 'validatePassword: rejects >200 chars',
        tags: ['unit', 'users'],
        testFn: async () => {
            try { validatePassword('x'.repeat(300)); return false; } catch { return true; }
        },
    },
    {
        name: 'validateName: trims + requires',
        tags: ['unit', 'users'],
        testFn: async () => {
            if (validateName('  Sid  ') !== 'Sid') return false;
            try { validateName(''); return false; } catch { /* expected */ }
            try { validateName('   '); return false; } catch { /* expected */ }
            return true;
        },
    },

    {
        name: 'hashPassword produces argon2id hash starting with $argon2id$',
        tags: ['unit', 'users', 'auth'],
        testFn: async () => {
            const hash = await hashPassword('correct horse battery staple');
            return typeof hash === 'string' && hash.startsWith('$argon2id$');
        },
    },
    {
        name: 'verifyPassword: correct password → true',
        tags: ['unit', 'users', 'auth'],
        testFn: async () => {
            const hash = await hashPassword('correct horse battery staple');
            return await verifyPassword(hash, 'correct horse battery staple');
        },
    },
    {
        name: 'verifyPassword: wrong password → false',
        tags: ['unit', 'users', 'auth'],
        testFn: async () => {
            const hash = await hashPassword('correct horse battery staple');
            return !(await verifyPassword(hash, 'wrong horse battery staple'));
        },
    },
    {
        name: 'verifyPassword: malformed hash → false (does not throw)',
        tags: ['unit', 'users', 'auth'],
        testFn: async () => !(await verifyPassword('not a real hash', 'whatever')),
    },

    {
        name: 'toPublicUser: strips passwordHash',
        tags: ['unit', 'users'],
        testFn: async () => {
            const user: User = {
                _id: new ObjectId(),
                email: 'owner@example.com',
                passwordHash: '$argon2id$very-secret',
                name: 'Owner',
                createdAt: new Date(),
            };
            const pub = toPublicUser(user);
            // Runtime check: the projected object must not have a passwordHash key
            // even if future refactors mistakenly spread the whole user.
            return !('passwordHash' in (pub as unknown as Record<string, unknown>))
                && pub.email === 'owner@example.com'
                && pub.name === 'Owner'
                && typeof pub.id === 'string' && pub.id.length === 24;
        },
    },
    {
        name: 'toPublicMembership: returns hex-string ids',
        tags: ['unit', 'users'],
        testFn: async () => {
            const m: Membership = {
                _id: new ObjectId(),
                userId: new ObjectId(),
                locationId: 'skb',
                role: 'owner',
                createdAt: new Date(),
            };
            const pub = toPublicMembership(m);
            return pub.locationId === 'skb'
                && pub.role === 'owner'
                && typeof pub.userId === 'string' && pub.userId.length === 24
                && typeof pub.id === 'string' && pub.id.length === 24;
        },
    },
];

void runTests(cases, 'users service (unit)');
