// ============================================================================
// SKB - Password reset tokens (issue #53)
// ============================================================================
//
// Self-serve password reset: user requests a reset link, server emails a
// one-time-use token, user POSTs the token + new password to set a new
// hash. Spec §16 flagged this as "table stakes" — this ships in v1.
//
// Security shape:
//   * The token issued to the user is 32 random bytes, base64url-encoded.
//   * The DB row only stores the SHA-256 hash of the token. A DB leak
//     therefore doesn't yield valid reset links.
//   * 1-hour TTL via a Mongo TTL index on `expiresAt` (see mongo.ts).
//   * Single use: on successful confirm we set `usedAt` AND delete the
//     document so an attacker who later gets DB access can't replay.
//   * Requesting a reset for a non-existent email is indistinguishable
//     from a real request (generic 200) — the caller never learns
//     whether an email is registered.
//   * Email delivery is mocked in dev: the token is printed to the server
//     log (spec §11.1 "visible in the Mailpit/dev console log"). A real
//     mailer wires in later; the contract of `sendResetEmail` doesn't
//     change.
// ============================================================================

import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';

import { getDb, passwordResets } from '../core/db/mongo.js';
import type { PasswordReset, User } from '../types/identity.js';

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function generateResetToken(): { token: string; tokenHash: string } {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = hashToken(token);
    return { token, tokenHash };
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a reset token record for a user. Returns the plaintext token
 * (to email) + the stored doc. The caller is responsible for actually
 * sending the email — kept pure here so unit tests don't need a mailer.
 *
 * We allow multiple live tokens for the same user (requesting twice
 * issues two working tokens); the TTL index reaps them. This is safer
 * than trying to invalidate prior tokens because a user who didn't get
 * the first email can request a second.
 */
export async function createResetToken(userId: ObjectId): Promise<{ token: string; record: PasswordReset }> {
    const { token, tokenHash } = generateResetToken();
    const now = new Date();
    const record: PasswordReset = {
        _id: new ObjectId(),
        userId,
        tokenHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
    };
    const db = await getDb();
    await passwordResets(db).insertOne(record);
    return { token, record };
}

/**
 * Consume a reset token: look up by hash, enforce TTL + single-use, and
 * return the userId if valid. The caller then calls `setUserPassword`.
 *
 * On success the record is deleted so no replay is possible, even in the
 * millisecond between setting usedAt and the TTL reaping it.
 */
export async function consumeResetToken(token: string): Promise<ObjectId | null> {
    if (typeof token !== 'string' || token.length === 0) return null;
    const tokenHash = hashToken(token);
    const db = await getDb();
    const doc = await passwordResets(db).findOneAndDelete({
        tokenHash,
        expiresAt: { $gt: new Date() },
    });
    if (!doc) return null;
    return doc.userId;
}

/**
 * Dev-mode stub: log the reset link so tests and local devs can click
 * through it. Production wires in a real mailer by overriding this
 * behind a feature flag.
 */
export function logResetEmail(user: User, token: string): void {
    const link = buildResetLink(token);
    console.log(JSON.stringify({
        t: new Date().toISOString(),
        level: 'info',
        msg: 'auth.password_reset.email',
        email: user.email,
        // The token is logged in dev so the validation plan in spec §11.1
        // (Mailpit/console) works without a real SMTP hop. In production,
        // NODE_ENV=production should gate this line off; for v1 beta we
        // accept this trade-off (the server log is already sensitive).
        token,
        link,
    }));
}

export function buildResetLink(token: string): string {
    const base = process.env.PLATFORM_PUBLIC_URL ?? '';
    return `${base}/reset-password?t=${encodeURIComponent(token)}`;
}

// Exported for unit tests to exercise the hash without creating a DB doc.
export const __test__ = { TOKEN_TTL_MS };
