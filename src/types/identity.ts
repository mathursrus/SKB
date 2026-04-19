// ============================================================================
// SKB - Identity types (users, memberships, password resets)
// ============================================================================
//
// Multi-tenant named-auth primitives introduced by issue #53.
//
//  - User: a person with login credentials. Email is the natural key
//    (unique, lowercased). passwordHash is argon2id.
//  - Membership: binds a user to a location at a role. A user may have
//    many memberships (v1 UI only surfaces one, but the schema supports
//    multi-restaurant ownership without further migration).
//  - PasswordReset: single-use token for the v1 "email me a reset link"
//    flow. Scope note: the spec §16 flagged this as open; per the
//    open-question default ("yes, cheap and table-stakes"), it ships in
//    this issue.
// ============================================================================

import type { ObjectId } from 'mongodb';

export type Role = 'owner' | 'admin' | 'host';

export interface User {
    _id: ObjectId;
    email: string;           // lowercased, unique
    passwordHash: string;    // argon2id ($argon2id$...)
    name: string;
    createdAt: Date;
    emailVerifiedAt?: Date;
}

export interface Membership {
    _id: ObjectId;
    userId: ObjectId;
    locationId: string;      // Location._id (slug)
    role: Role;
    createdAt: Date;
    revokedAt?: Date;        // soft-delete; active iff absent
}

export interface PasswordReset {
    _id: ObjectId;
    userId: ObjectId;
    tokenHash: string;       // sha256 hex of the base64url token (token itself never stored)
    createdAt: Date;
    expiresAt: Date;
    usedAt?: Date;
}

/**
 * Staff invite (issue #55). An owner invites a teammate by email; the
 * server emails a one-time token link. On accept, the invitee sets a
 * password and a user + membership are provisioned atomically-ish
 * (same best-effort pattern used by createOwnerUser).
 *
 * Like PasswordReset, only the SHA-256 hash of the token is stored —
 * a DB leak doesn't yield valid accept links.
 */
export interface Invite {
    _id: ObjectId;
    email: string;           // lowercased; matches the User.email we'll create
    name: string;            // pre-filled in the accept form; invitee can change
    locationId: string;
    role: Role;              // 'admin' | 'host' (owners don't invite owners)
    invitedByUserId: ObjectId;
    tokenHash: string;       // sha256 hex; token itself never stored
    createdAt: Date;
    expiresAt: Date;
    acceptedAt?: Date;       // set when consumed; doc is also deleted on accept
    revokedAt?: Date;        // set when the owner cancels a pending invite
}

/**
 * Public-safe projection of an Invite. Used by the admin Staff tab to
 * list pending invites. Never exposes tokenHash.
 */
export interface PublicInvite {
    id: string;
    email: string;
    name: string;
    locationId: string;
    role: Role;
    createdAt: Date;
    expiresAt: Date;
}

/**
 * The payload encoded inside an `skb_session` cookie.
 * Kept small — short keys because this travels on every request.
 */
export interface SessionPayload {
    uid: string;             // User._id as hex string
    lid: string;             // Location._id slug
    role: Role;
    exp: number;             // unix seconds
}

/**
 * Public-safe projection of a User — never includes passwordHash.
 * Returned by whoami-style endpoints.
 */
export interface PublicUser {
    id: string;              // User._id hex string
    email: string;
    name: string;
    createdAt: Date;
}

/**
 * Public-safe projection of a Membership.
 */
export interface PublicMembership {
    id: string;
    userId: string;
    locationId: string;
    role: Role;
    createdAt: Date;
}
