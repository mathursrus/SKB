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
