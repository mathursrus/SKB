// ============================================================================
// SKB - Users + memberships (issue #53)
// ============================================================================
//
// Named-user authentication for the multi-tenant platform.
//
// Key rules (enforced here, tested in unit + integration suites):
//   * Email is lowercased on every write and read.
//   * passwordHash never leaves this module — `toPublicUser()` strips it
//     and `findUserByEmail` returns the full doc only to the login
//     codepath that needs the hash for verification.
//   * `createOwnerUser` is the signup helper: creates a user + a
//     role=owner membership atomically (best-effort; Mongo can't span
//     collections without a session, but the operation is idempotent on
//     retry because the unique email index makes a duplicate user insert
//     fail first).
//   * Re-inviting a previously-revoked teammate works: the unique index
//     on memberships is partial (active rows only), so re-adding inserts
//     a fresh row while the revoked history is preserved for audit.
// ============================================================================

import argon2 from 'argon2';
import { ObjectId, type Db } from 'mongodb';

import {
    getDb,
    users,
    memberships,
} from '../core/db/mongo.js';
import type {
    User,
    Membership,
    PublicUser,
    PublicMembership,
    Role,
} from '../types/identity.js';

// Argon2id default params (spec §8.1): m=19MB, t=2, p=1.
// These are the OWASP-recommended defaults for interactive logins in 2024+.
const ARGON2_OPTS: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19 * 1024, // kibibytes → 19 MiB
    timeCost: 2,
    parallelism: 1,
};

const MIN_PASSWORD_LEN = 10;
const MAX_PASSWORD_LEN = 200;
const MAX_NAME_LEN = 120;
const MAX_EMAIL_LEN = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateOwnerUserInput {
    email: string;
    password: string;
    name: string;
    locationId: string;
}

export interface CreateOwnerUserResult {
    user: PublicUser;
    membership: PublicMembership;
}

export function normalizeEmail(email: string): string {
    return String(email ?? '').trim().toLowerCase();
}

export function validateEmail(email: string): string {
    const norm = normalizeEmail(email);
    if (!norm) throw new Error('email is required');
    if (norm.length > MAX_EMAIL_LEN) throw new Error(`email must be <= ${MAX_EMAIL_LEN} chars`);
    if (!EMAIL_RE.test(norm)) throw new Error('email must be a valid email address');
    return norm;
}

export function validatePassword(password: string): void {
    if (typeof password !== 'string') throw new Error('password is required');
    if (password.length < MIN_PASSWORD_LEN) {
        throw new Error(`password must be at least ${MIN_PASSWORD_LEN} chars`);
    }
    if (password.length > MAX_PASSWORD_LEN) {
        throw new Error(`password must be <= ${MAX_PASSWORD_LEN} chars`);
    }
}

export function validateName(name: string): string {
    const n = String(name ?? '').trim();
    if (!n) throw new Error('name is required');
    if (n.length > MAX_NAME_LEN) throw new Error(`name must be <= ${MAX_NAME_LEN} chars`);
    return n;
}

export async function hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
    if (!hash || typeof password !== 'string') return false;
    try {
        return await argon2.verify(hash, password);
    } catch {
        return false;
    }
}

export function toPublicUser(user: User): PublicUser {
    return {
        id: user._id.toHexString(),
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
    };
}

export function toPublicMembership(m: Membership): PublicMembership {
    return {
        id: m._id.toHexString(),
        userId: m.userId.toHexString(),
        locationId: m.locationId,
        role: m.role,
        createdAt: m.createdAt,
    };
}

/**
 * Internal: fetch a user by email including the passwordHash.
 * Only the login handler + password-reset confirm should call this.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
    const norm = normalizeEmail(email);
    if (!norm) return null;
    const db = await getDb();
    return users(db).findOne({ email: norm });
}

export async function findUserById(userId: string | ObjectId): Promise<User | null> {
    const id = userId instanceof ObjectId ? userId : safeObjectId(userId);
    if (!id) return null;
    const db = await getDb();
    return users(db).findOne({ _id: id });
}

function safeObjectId(value: string): ObjectId | null {
    try { return new ObjectId(value); } catch { return null; }
}

async function insertUser(
    db: Db,
    email: string,
    passwordHash: string,
    name: string,
): Promise<User> {
    const doc: User = {
        _id: new ObjectId(),
        email,
        passwordHash,
        name,
        createdAt: new Date(),
    };
    await users(db).insertOne(doc);
    return doc;
}

async function insertMembership(
    db: Db,
    userId: ObjectId,
    locationId: string,
    role: Role,
): Promise<Membership> {
    const doc: Membership = {
        _id: new ObjectId(),
        userId,
        locationId,
        role,
        createdAt: new Date(),
    };
    await memberships(db).insertOne(doc);
    return doc;
}

/**
 * Create an owner: user + role=owner membership for `locationId`.
 *
 * Throws:
 *  - `email already registered` if the email is taken (generic — don't
 *     leak which emails exist to an unauthenticated caller).
 *  - validation errors from `validateEmail` / `validatePassword` /
 *     `validateName` on bad inputs.
 */
export async function createOwnerUser(input: CreateOwnerUserInput): Promise<CreateOwnerUserResult> {
    const email = validateEmail(input.email);
    validatePassword(input.password);
    const name = validateName(input.name);
    if (!input.locationId || typeof input.locationId !== 'string') {
        throw new Error('locationId is required');
    }

    const db = await getDb();
    const passwordHash = await hashPassword(input.password);

    let user: User;
    try {
        user = await insertUser(db, email, passwordHash, name);
    } catch (err) {
        if (isDuplicateKeyError(err)) {
            throw new Error('email already registered');
        }
        throw err;
    }

    // If membership insert fails we don't roll back the user — next signup
    // attempt with the same email will fail fast on the email index, and
    // the operator can repair from MCP. This is acceptable because
    // createOwnerUser only runs at signup time (a human-initiated flow)
    // and partial state is a one-row audit trail, not silent data loss.
    const membership = await insertMembership(db, user._id, input.locationId, 'owner');

    return { user: toPublicUser(user), membership: toPublicMembership(membership) };
}

function isDuplicateKeyError(err: unknown): boolean {
    return Boolean(err)
        && typeof err === 'object'
        && (err as { code?: number }).code === 11000;
}

/**
 * List all active (non-revoked) memberships for a user. Used by the
 * login handler to decide whether to route straight through or show the
 * "which restaurant?" picker (spec §6.4).
 */
export async function listActiveMembershipsForUser(
    userId: string | ObjectId,
): Promise<Membership[]> {
    const id = userId instanceof ObjectId ? userId : safeObjectId(userId);
    if (!id) return [];
    const db = await getDb();
    return memberships(db)
        .find({ userId: id, revokedAt: { $exists: false } })
        .toArray();
}

/**
 * Look up a user's active membership at a specific location. Returns
 * `null` if the user has no active membership there (or the user id is
 * malformed).
 */
export async function findActiveMembership(
    userId: string | ObjectId,
    locationId: string,
): Promise<Membership | null> {
    const id = userId instanceof ObjectId ? userId : safeObjectId(userId);
    if (!id) return null;
    const db = await getDb();
    return memberships(db).findOne({
        userId: id,
        locationId,
        revokedAt: { $exists: false },
    });
}

/**
 * Update a user's password by id. Used by the password-reset confirm
 * flow. Validates the new password and rewrites the hash.
 */
export async function setUserPassword(userId: ObjectId, newPassword: string): Promise<void> {
    validatePassword(newPassword);
    const passwordHash = await hashPassword(newPassword);
    const db = await getDb();
    await users(db).updateOne({ _id: userId }, { $set: { passwordHash } });
}
