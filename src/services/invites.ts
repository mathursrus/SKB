// ============================================================================
// SKB - Staff invites (issue #55)
// ============================================================================
//
// Owner-driven staff management: the owner enters an email + name + role
// and the server mints a one-time-use token. The invitee clicks the
// emailed link, picks a password, and is logged in at the right
// location with the right role.
//
// Security shape mirrors password resets (src/services/passwordResets.ts):
//   * Token is 32 random bytes, base64url-encoded — given to the
//     invitee, never stored. The DB holds only the SHA-256 hash.
//   * TTL is 7 days (spec §6.3). Past that the token is expired and
//     the invitee is told to ask the owner to resend.
//   * Accept is idempotent-in-safety: on success the invite row is
//     deleted and a membership is inserted. Re-clicking a consumed
//     link returns the same not-found error as an expired one.
//
// Re-invites: if an owner re-invites the same email that already has a
// pending invite, we replace the old row with a new token (cancels the
// old email link). This matches the UX in the mock — the owner taps
// "Resend" and expects the new link to work, not both.
// ============================================================================

import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';

import {
    getDb,
    invites as invitesColl,
    memberships as membershipsColl,
    users as usersColl,
} from '../core/db/mongo.js';
import {
    hashPassword,
    validateEmail,
    validateName,
    validatePassword,
    normalizeEmail,
    toPublicMembership,
    toPublicUser,
} from './users.js';
import type {
    Invite,
    Membership,
    PublicInvite,
    PublicUser,
    PublicMembership,
    Role,
    User,
} from '../types/identity.js';

const TOKEN_BYTES = 32;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (spec §6.3)

const INVITABLE_ROLES: readonly Role[] = ['admin', 'host'] as const;

export function isInvitableRole(value: unknown): value is 'admin' | 'host' {
    return typeof value === 'string'
        && (INVITABLE_ROLES as readonly string[]).includes(value);
}

export function generateInviteToken(): { token: string; tokenHash: string } {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = hashToken(token);
    return { token, tokenHash };
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function toPublicInvite(inv: Invite): PublicInvite | null {
    const id = objectIdToHex(inv._id);
    if (!id) return null;
    return {
        id,
        email: inv.email,
        name: inv.name,
        locationId: inv.locationId,
        role: inv.role,
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
    };
}

export interface CreateInviteInput {
    email: string;
    name?: string;
    role: 'admin' | 'host';
    locationId: string;
    invitedByUserId: ObjectId;
}

export interface CreateInviteResult {
    invite: PublicInvite;
    /** Plaintext token — include in the emailed link, NEVER log at production. */
    token: string;
}

function normalizeInviteName(name: unknown): string {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return '';
    return validateName(trimmed);
}

/**
 * Create a pending invite. If a pending invite already exists for the
 * same (email, locationId), it is replaced (the old token becomes
 * invalid). Throws if the email already has an active membership at the
 * same location (no duplicate provisioning).
 */
export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
    const email = validateEmail(input.email);
    const name = normalizeInviteName(input.name);
    if (!isInvitableRole(input.role)) {
        throw new Error('role must be admin or host');
    }
    if (!input.locationId || typeof input.locationId !== 'string') {
        throw new Error('locationId is required');
    }

    const db = await getDb();

    // If this email already has an active membership at the same tenant,
    // bail — they're already on staff, there's nothing to accept.
    const existingUser = await usersColl(db).findOne({ email });
    if (existingUser) {
        const active = await membershipsColl(db).findOne({
            userId: existingUser._id,
            locationId: input.locationId,
            revokedAt: { $exists: false },
        });
        if (active) throw new Error('already a member');
    }

    // Replace any prior pending invite for this (email, locationId).
    // "Prior pending" = row with no acceptedAt and no revokedAt — a stale
    // link that the new invite should supersede. We delete outright (TTL
    // would eventually reap it anyway) so the unique-tokenHash index
    // doesn't block the next insert.
    await invitesColl(db).deleteMany({
        locationId: input.locationId,
        email,
        acceptedAt: { $exists: false },
        revokedAt: { $exists: false },
    });

    const { token, tokenHash } = generateInviteToken();
    const now = new Date();
    const doc: Invite = {
        _id: new ObjectId(),
        email,
        name,
        locationId: input.locationId,
        role: input.role,
        invitedByUserId: input.invitedByUserId,
        tokenHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    };
    await invitesColl(db).insertOne(doc);
    const invite = toPublicInvite(doc);
    if (!invite) throw new Error('invite id invalid');
    return { invite, token };
}

/**
 * List pending invites for a location (not yet accepted, not revoked,
 * and not expired). Used by the Staff tab under the active-staff table.
 */
export async function listPendingInvites(locationId: string): Promise<PublicInvite[]> {
    const db = await getDb();
    // Hint the (locationId, createdAt) compound index by name. Without the
    // hint, Mongo's planner non-deterministically picks one of several
    // candidate indexes for `find({locationId, …})` — and on Azure Cosmos DB
    // any plan that adds an in-memory SORT stage (e.g. picking the bare
    // `(locationId, email)` index) is rejected and the route 503s. Issue #93.
    const rows = await invitesColl(db)
        .find({
            locationId,
            acceptedAt: { $exists: false },
            revokedAt: { $exists: false },
            expiresAt: { $gt: new Date() },
        })
        .sort({ createdAt: 1 })
        .hint('invite_loc_createdAt_for_staff_list')
        .toArray();
    return rows.flatMap((row) => {
        const invite = toPublicInvite(row);
        return invite ? [invite] : [];
    });
}

/**
 * Cancel a pending invite (owner clicks "Cancel invite" in the Staff
 * tab). Idempotent — returns true if a row was revoked, false if
 * nothing matched. Scoped by locationId so a cross-tenant probe with a
 * leaked invite id still 404s.
 */
export async function revokeInvite(
    locationId: string,
    inviteId: string,
): Promise<boolean> {
    const id = safeObjectId(inviteId);
    if (!id) return false;
    const db = await getDb();
    const now = new Date();
    const result = await invitesColl(db).updateOne(
        {
            _id: id,
            locationId,
            acceptedAt: { $exists: false },
            revokedAt: { $exists: false },
        },
        { $set: { revokedAt: now } },
    );
    return result.modifiedCount === 1;
}

/**
 * Peek at a pending invite by token — used to render the accept page
 * with the invitee's pre-filled name + email + role. Never returns the
 * tokenHash. Returns null for missing/expired/consumed tokens.
 */
export async function findInviteByToken(token: string): Promise<PublicInvite | null> {
    if (typeof token !== 'string' || token.length === 0) return null;
    const tokenHash = hashToken(token);
    const db = await getDb();
    const doc = await invitesColl(db).findOne({
        tokenHash,
        acceptedAt: { $exists: false },
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
    });
    return doc ? toPublicInvite(doc) : null;
}

export interface AcceptInviteInput {
    token: string;
    password: string;
    /** Invitee may override the owner-supplied name at accept time. */
    name?: string;
}

export interface AcceptInviteResult {
    user: PublicUser;
    membership: PublicMembership;
    locationId: string;
    role: Role;
}

/**
 * Consume an invite token:
 *   1. Validate token is live (exists, not accepted, not revoked, not expired).
 *   2. Provision user-or-find-user (if the email already has an account,
 *      we attach a membership instead of creating a second user).
 *   3. Insert the active membership row.
 *   4. Mark the invite as accepted AND delete the row — both so the TTL
 *      index doesn't reap prematurely, and so a replay with the same
 *      token fails at the `acceptedAt: $exists: false` filter.
 *
 * Returns enough info for the caller to mint an skb_session cookie.
 * Throws Error('invalid or expired token') on any failure of step 1,
 * and Error('...') for password validation failures.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<AcceptInviteResult> {
    const token = typeof input.token === 'string' ? input.token : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!token) throw new Error('token required');
    validatePassword(password);

    const db = await getDb();
    const tokenHash = hashToken(token);

    // Step 1: atomically "claim" the invite by setting acceptedAt. This
    // closes the double-accept race (two concurrent POSTs with the same
    // token) without a transaction: only the first findOneAndUpdate
    // returns the doc, subsequent calls see `acceptedAt` set and miss.
    const now = new Date();
    const claim = await invitesColl(db).findOneAndUpdate(
        {
            tokenHash,
            acceptedAt: { $exists: false },
            revokedAt: { $exists: false },
            expiresAt: { $gt: now },
        },
        { $set: { acceptedAt: now } },
        { returnDocument: 'after' },
    );
    if (!claim) throw new Error('invalid or expired token');

    const invite = claim;
    const emailNormalized = normalizeEmail(invite.email);
    const providedName = String(input.name ?? '').trim();
    const acceptedName = providedName.length > 0
        ? validateName(providedName)
        : normalizeInviteName(invite.name);

    // Step 2: find-or-create the user. If an account already exists for
    // this email (e.g. the invitee is owner elsewhere), we attach a new
    // membership to the existing user. Otherwise we create a user.
    let user = await usersColl(db).findOne({ email: emailNormalized });
    if (!user) {
        if (!acceptedName) throw new Error('name is required');
        const passwordHash = await hashPassword(password);
        const userDoc: User = {
            _id: new ObjectId(),
            email: emailNormalized,
            passwordHash,
            name: acceptedName,
            createdAt: now,
        };
        try {
            await usersColl(db).insertOne(userDoc);
            user = userDoc;
        } catch (err) {
            // Race: a parallel signup created the same email. Roll back the
            // invite claim so the owner can resend (or the caller can retry).
            await invitesColl(db).updateOne(
                { _id: invite._id },
                { $unset: { acceptedAt: '' } },
            );
            if (isDuplicateKeyError(err)) throw new Error('email already registered');
            throw err;
        }
    } else {
        const updateFields: Partial<Pick<User, 'passwordHash' | 'name'>> = {
            passwordHash: await hashPassword(password),
        };
        if (providedName.length > 0 && acceptedName !== user.name) {
            updateFields.name = acceptedName;
        }
        await usersColl(db).updateOne({ _id: user._id }, { $set: updateFields });
        user = { ...user, ...updateFields };
    }
    // Existing accounts keep their identity, but the password entered
    // during invite acceptance becomes the next login password.

    // Step 3: insert the membership. If one somehow already exists active
    // for this (user, location), we bail with a clear error. The partial
    // unique index `user_location_revoked_unique` enforces this at the DB
    // layer too.
    try {
        const membershipDoc: Membership = {
            _id: new ObjectId(),
            userId: user._id,
            locationId: invite.locationId,
            role: invite.role,
            createdAt: now,
        };
        await membershipsColl(db).insertOne(membershipDoc);
        // Step 4: delete the invite row to keep the collection lean.
        await invitesColl(db).deleteOne({ _id: invite._id });
        return {
            user: toPublicUser(user),
            membership: toPublicMembership(membershipDoc),
            locationId: invite.locationId,
            role: invite.role,
        };
    } catch (err) {
        if (isDuplicateKeyError(err)) {
            // Already a member — no new membership, but the invite is
            // consumed (accepted). Delete the invite, return the existing
            // active membership so the login flow still works.
            await invitesColl(db).deleteOne({ _id: invite._id });
            const existing = await membershipsColl(db).findOne({
                userId: user._id,
                locationId: invite.locationId,
                revokedAt: { $exists: false },
            });
            if (!existing) throw new Error('membership conflict');
            return {
                user: toPublicUser(user),
                membership: toPublicMembership(existing),
                locationId: invite.locationId,
                role: invite.role,
            };
        }
        throw err;
    }
}

/**
 * Revoke (soft-delete) a membership. Used by POST /staff/revoke. Returns
 * true if a row was updated. Scoped by locationId so cross-tenant
 * revocation attempts fail silently.
 *
 * NOTE: R4 says "Revoked membership fails at next request (cookie lookup
 * checks revokedAt)". The enforcement for that is in requireRole —
 * this function just flips the bit. See hostAuth.ts.
 */
export async function revokeMembership(
    locationId: string,
    membershipId: string,
): Promise<boolean> {
    const id = safeObjectId(membershipId);
    if (!id) return false;
    const db = await getDb();
    const result = await membershipsColl(db).updateOne(
        { _id: id, locationId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
    );
    return result.modifiedCount === 1;
}

/**
 * List all active (non-revoked) memberships at a location, enriched
 * with the user's name + email so the Staff tab can render rows
 * without a per-row join.
 */
export interface StaffRow {
    membershipId: string;
    userId: string;
    email: string;
    name: string;
    role: Role;
    createdAt: Date;
}
export async function listStaffAtLocation(locationId: string): Promise<StaffRow[]> {
    const db = await getDb();
    // Hint the (locationId, createdAt) compound index by name. See
    // listPendingInvites above for the full Cosmos rationale (issue #93).
    const members = await membershipsColl(db)
        .find({ locationId, revokedAt: { $exists: false } })
        .sort({ createdAt: 1 })
        .hint('location_createdAt_for_staff_list')
        .toArray();
    if (members.length === 0) return [];
    const normalized = members.flatMap((member) => {
        const membershipId = objectIdToHex(member._id);
        const userId = objectIdToHex(member.userId);
        if (!membershipId || !userId) return [];
        return [{ member, membershipId, userId }];
    });
    if (normalized.length === 0) return [];
    const userIds = normalized.map(({ userId }) => new ObjectId(userId));
    const foundUsers = await usersColl(db).find({ _id: { $in: userIds } }).toArray();
    const byId = new Map<string, User>(foundUsers.map(u => [u._id.toHexString(), u]));
    const rows: StaffRow[] = [];
    for (const { membershipId, userId, member } of normalized) {
        const u = byId.get(userId);
        if (!u) continue; // user deleted; skip
        rows.push({
            membershipId,
            userId,
            email: u.email,
            name: u.name,
            role: member.role,
            createdAt: member.createdAt,
        });
    }
    return rows;
}

function objectIdToHex(value: unknown): string | null {
    if (value instanceof ObjectId) return value.toHexString();
    if (typeof value !== 'string' || !ObjectId.isValid(value)) return null;
    return new ObjectId(value).toHexString();
}

function safeObjectId(value: string): ObjectId | null {
    try { return new ObjectId(value); } catch { return null; }
}

function isDuplicateKeyError(err: unknown): boolean {
    return Boolean(err)
        && typeof err === 'object'
        && (err as { code?: number }).code === 11000;
}

// Exported for tests.
export const __test__ = { hashToken, generateInviteToken };
