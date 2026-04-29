// ============================================================================
// Unit tests for src/services/invites.ts
// ============================================================================
//
// Covers the pure-logic surface:
//   * isInvitableRole — accepts owner / admin / host (issue #106 added owner)
//   * hashToken — deterministic, 64-char hex
//   * generateInviteToken — non-empty token, hash matches
//   * toPublicInvite — projects PublicInvite, strips tokenHash
//
// DB-backed helpers (createInvite, listPendingInvites, acceptInvite,
// revokeInvite, revokeMembership) are exercised in the integration suite
// at tests/integration/invites.integration.test.ts because they need a
// live Mongo.

import { runTests, type BaseTestCase } from '../test-utils.js';
import { ObjectId } from 'mongodb';

import {
    isInvitableRole,
    toPublicInvite,
    __test__,
} from '../../src/services/invites.js';
import type { Invite } from '../../src/types/identity.js';

const { hashToken, generateInviteToken } = __test__;

const cases: BaseTestCase[] = [
    {
        name: 'isInvitableRole: accepts admin',
        tags: ['unit', 'invites'],
        testFn: async () => isInvitableRole('admin'),
    },
    {
        name: 'isInvitableRole: accepts host',
        tags: ['unit', 'invites'],
        testFn: async () => isInvitableRole('host'),
    },
    {
        name: 'isInvitableRole: accepts owner (issue #106 — co-owners)',
        tags: ['unit', 'invites'],
        testFn: async () => isInvitableRole('owner'),
    },
    {
        name: 'isInvitableRole: rejects empty string',
        tags: ['unit', 'invites'],
        testFn: async () => !isInvitableRole(''),
    },
    {
        name: 'isInvitableRole: rejects non-strings',
        tags: ['unit', 'invites'],
        testFn: async () => !isInvitableRole(undefined) && !isInvitableRole(null) && !isInvitableRole(123),
    },

    // ---- token shape ----
    {
        name: 'hashToken: produces 64-hex (sha256)',
        tags: ['unit', 'invites'],
        testFn: async () => {
            const h = hashToken('some-fake-token');
            return /^[0-9a-f]{64}$/.test(h);
        },
    },
    {
        name: 'hashToken: deterministic',
        tags: ['unit', 'invites'],
        testFn: async () => {
            const a = hashToken('same-input');
            const b = hashToken('same-input');
            return a === b;
        },
    },
    {
        name: 'hashToken: different inputs → different hashes',
        tags: ['unit', 'invites'],
        testFn: async () => {
            return hashToken('abc') !== hashToken('abd');
        },
    },
    {
        name: 'generateInviteToken: returns token + matching hash',
        tags: ['unit', 'invites'],
        testFn: async () => {
            const { token, tokenHash } = generateInviteToken();
            if (typeof token !== 'string' || token.length === 0) return false;
            // base64url never contains + / =; at minimum the token must be URL-safe.
            if (/[^A-Za-z0-9_-]/.test(token)) return false;
            return tokenHash === hashToken(token);
        },
    },
    {
        name: 'generateInviteToken: random — two calls differ',
        tags: ['unit', 'invites'],
        testFn: async () => {
            const a = generateInviteToken();
            const b = generateInviteToken();
            return a.token !== b.token && a.tokenHash !== b.tokenHash;
        },
    },

    // ---- projection ----
    {
        name: 'toPublicInvite: strips tokenHash, serializes id as hex',
        tags: ['unit', 'invites'],
        testFn: async () => {
            const id = new ObjectId();
            const invitedBy = new ObjectId();
            const doc: Invite = {
                _id: id,
                email: 'x@example.com',
                name: 'X',
                locationId: 'skb',
                role: 'host',
                invitedByUserId: invitedBy,
                tokenHash: 'c'.repeat(64),
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 86_400_000),
            };
            const pub = toPublicInvite(doc);
            if (!pub) return false;
            if (pub.id !== id.toHexString()) return false;
            if (pub.email !== 'x@example.com') return false;
            if (pub.role !== 'host') return false;
            if (pub.locationId !== 'skb') return false;
            // tokenHash must not leak.
            if (JSON.stringify(pub).includes('c'.repeat(16))) return false;
            if ('tokenHash' in pub) return false;
            return true;
        },
    },
];

void runTests(cases, 'Staff invites — unit (issue #55)');
