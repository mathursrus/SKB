// ============================================================================
// SKB - Host + session auth (HMAC-signed cookies, tenant + role scoped)
// ============================================================================
//
// Two cookies, one verifier:
//
//   skb_host    — PIN-gated anonymous shared-device session (#52).
//                 Issued by POST /r/:loc/api/host/login. Role is always 'host'.
//                 Format: <lid>.<exp>.<mac>   mac = HMAC(secret, '<lid>.<exp>')
//                 Legacy (pre-#52): <exp>.<mac>   mac = HMAC(secret, String(exp))
//                 (accepted during deprecation window).
//
//   skb_session — Named-user session (#53).
//                 Issued by POST /api/login (email+password).
//                 Payload encodes uid/lid/role. The MAC covers the whole
//                 payload so tampering with role or lid invalidates the
//                 cookie.
//                 Format: <payload-b64url>.<mac>
//                          payload = base64url(JSON.stringify({uid,lid,role,exp}))
//                          mac = HMAC(secret, payload-b64url)
//
// Request resolution order inside `requireRole`:
//   1. skb_session present → verify + decode → check role + lid → allow/deny
//   2. skb_host present → verify (new or legacy format) → infer role='host'
//   3. Neither → 401
//
// When a request has BOTH cookies (e.g. a staff member who also PINed
// in on the shared tablet), skb_session wins — named identity is always
// more specific than anonymous PIN access.
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';

import type { Role, SessionPayload } from '../types/identity.js';
import { getDb, memberships as membershipsColl } from '../core/db/mongo.js';

const COOKIE_NAME = 'skb_host';
const SESSION_COOKIE_NAME = 'skb_session';
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60; // 12h

function secret(): string | null {
    return process.env.SKB_COOKIE_SECRET ?? null;
}

function pin(): string | null {
    return process.env.SKB_HOST_PIN ?? null;
}

function sign(payload: string, key: string): string {
    return createHmac('sha256', key).update(payload).digest('hex');
}

/**
 * Build a legacy-format cookie value `<exp>.<hmac>`.
 * Still used by `loginHandler` (the legacy top-level handler kept for
 * backward compatibility); production login via `src/routes/host.ts` uses
 * `mintLocationCookie` instead.
 */
function mintCookie(now: Date, key: string): string {
    const exp = Math.floor(now.getTime() / 1000) + COOKIE_MAX_AGE_SECONDS;
    const mac = sign(String(exp), key);
    return `${exp}.${mac}`;
}

/**
 * Build the new location-scoped cookie `<lid>.<exp>.<mac>`. The MAC input
 * covers BOTH lid and exp so an attacker can't swap the lid prefix on a
 * captured cookie and pass the verifier.
 */
function mintLocationCookie(now: Date, key: string, lid: string): string {
    const exp = Math.floor(now.getTime() / 1000) + COOKIE_MAX_AGE_SECONDS;
    const mac = sign(`${lid}.${exp}`, key);
    return `${lid}.${exp}.${mac}`;
}

/** Structured result from `verifyCookieDetailed`. */
export interface VerifyResult {
    ok: boolean;
    /** Location id if the cookie is new-format. Undefined for legacy. */
    lid?: string;
    /** True when the cookie matched the legacy 2-segment format. */
    legacy: boolean;
}

/**
 * Verify a cookie value against `key`. Accepts both the legacy `<exp>.<mac>`
 * format and the new `<lid>.<exp>.<mac>` format.
 *
 * Returns a rich result so callers can branch on tenant / log legacy use.
 * The scalar `verifyCookie()` below preserves the old boolean API.
 */
export function verifyCookieDetailed(
    value: string,
    key: string,
    now: Date = new Date(),
): VerifyResult {
    if (typeof value !== 'string' || value.length === 0) return { ok: false, legacy: false };
    const segments = value.split('.');
    // Cookie shape dictates which fields carry the lid and which substring is
    // covered by the MAC. Everything downstream (regex, expiry, HMAC compare)
    // is identical — derive the shape once and share the rest.
    let lid: string | undefined;
    let expStr: string;
    let got: string;
    let macInput: string;
    let legacy: boolean;
    if (segments.length === 3) {
        [lid, expStr, got] = segments;
        if (!lid) return { ok: false, legacy: false };
        macInput = `${lid}.${expStr}`;
        legacy = false;
    } else if (segments.length === 2) {
        [expStr, got] = segments;
        macInput = expStr;
        legacy = true;
    } else {
        return { ok: false, legacy: false };
    }
    if (!/^\d+$/.test(expStr) || got.length !== 64) return { ok: false, legacy };
    if (parseInt(expStr, 10) * 1000 <= now.getTime()) return { ok: false, legacy };
    try {
        const ok = timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(sign(macInput, key), 'hex'));
        return ok ? { ok: true, lid, legacy } : { ok: false, legacy };
    } catch {
        return { ok: false, legacy };
    }
}

/**
 * Backward-compatible boolean verifier. Kept for the existing unit tests
 * and any external caller that just wants a pass/fail answer.
 */
export function verifyCookie(value: string, key: string, now: Date = new Date()): boolean {
    return verifyCookieDetailed(value, key, now).ok;
}

/** Extract a named cookie value from a raw `Cookie:` header. */
function readNamedCookie(header: string | undefined, cookieName: string): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const name = part.slice(0, eq).trim();
        if (name === cookieName) return part.slice(eq + 1).trim();
    }
    return null;
}

/** Extract the `skb_host` cookie value from a raw `Cookie:` header. */
export function readCookie(header: string | undefined): string | null {
    return readNamedCookie(header, COOKIE_NAME);
}

/** Extract the `skb_session` cookie value from a raw `Cookie:` header. */
export function readSessionCookie(header: string | undefined): string | null {
    return readNamedCookie(header, SESSION_COOKIE_NAME);
}

// ----------------------------------------------------------------------------
// skb_session (named user) cookie format
//
//   <payload-b64url>.<mac>
//   payload = base64url(JSON.stringify({ uid, lid, role, exp }))
//   mac     = hex HMAC-SHA256(secret, payload-b64url)
//
// Keeping the payload base64url-encoded JSON (rather than signed JWTs)
// lets us reuse the existing HMAC + timingSafeEqual infrastructure, avoid
// adding a dependency for a token we only sign ourselves, and keep the
// parse/verify logic one file deep. A real JWT would get us nothing the
// codebase uses today (no asymmetric keys, no federated verifiers).
// ----------------------------------------------------------------------------

const VALID_ROLES: readonly Role[] = ['owner', 'admin', 'host'] as const;

function isRole(value: unknown): value is Role {
    return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value);
}

/**
 * Build a session cookie value from a payload. The caller is responsible
 * for setting `exp` — this function just signs and encodes.
 */
export function mintSessionCookie(payload: SessionPayload, key: string): string {
    const json = JSON.stringify(payload);
    const encoded = Buffer.from(json, 'utf8').toString('base64url');
    const mac = sign(encoded, key);
    return `${encoded}.${mac}`;
}

export interface SessionVerifyResult {
    ok: boolean;
    payload?: SessionPayload;
}

/**
 * Verify and decode a session cookie. Returns `ok: true` with the
 * payload on success, `ok: false` on any failure (bad MAC, bad JSON,
 * missing fields, expired, unknown role).
 */
export function verifySessionCookie(
    value: string,
    key: string,
    now: Date = new Date(),
): SessionVerifyResult {
    if (typeof value !== 'string' || value.length === 0) return { ok: false };
    const dot = value.lastIndexOf('.');
    if (dot <= 0 || dot === value.length - 1) return { ok: false };
    const encoded = value.slice(0, dot);
    const got = value.slice(dot + 1);
    if (got.length !== 64) return { ok: false };
    let macOk = false;
    try {
        macOk = timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(sign(encoded, key), 'hex'));
    } catch {
        return { ok: false };
    }
    if (!macOk) return { ok: false };
    let raw: string;
    try {
        raw = Buffer.from(encoded, 'base64url').toString('utf8');
    } catch {
        return { ok: false };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false };
    const p = parsed as Record<string, unknown>;
    const uid = p.uid, lid = p.lid, role = p.role, exp = p.exp;
    if (typeof uid !== 'string' || typeof lid !== 'string' || !isRole(role) || typeof exp !== 'number') {
        return { ok: false };
    }
    if (exp * 1000 <= now.getTime()) return { ok: false };
    return { ok: true, payload: { uid, lid, role, exp } };
}

export const SESSION_COOKIE_MAX_AGE_SECONDS = COOKIE_MAX_AGE_SECONDS;
export { SESSION_COOKIE_NAME };

/**
 * Auth context attached to `req` once a cookie has verified. Route handlers
 * can read `req.hostAuth.lid` (present unless the caller presented a legacy
 * cookie) and `req.hostAuth.legacy` (true during the deprecation window).
 *
 * `uid` is present only when a named-user `skb_session` cookie was used;
 * PIN-anonymous host sessions don't carry a user id. Handlers that
 * attribute actions to a specific person (e.g. future audit logs) should
 * check `uid` before persisting.
 */
export interface HostAuthContext {
    lid?: string;
    uid?: string;
    legacy: boolean;
    /** Which role the cookie actually claimed (session) or implied (PIN host). */
    role: Role;
    /** Which cookie the request presented. */
    source: 'session' | 'host';
}

// Augment express Request with optional host-auth context (ambient, no
// global side effect; only the middleware sets this property). The
// property is named `hostAuth` rather than `auth` to avoid colliding
// with `IncomingMessage.auth` from `@modelcontextprotocol/sdk`, which
// uses that slot for MCP `AuthInfo`.
declare module 'express-serve-static-core' {
    interface Request {
        hostAuth?: HostAuthContext;
    }
}

function emitLog(obj: Record<string, unknown>): void {
    console.log(JSON.stringify({ t: new Date().toISOString(), ...obj }));
}

function safeObjectId(value: string): ObjectId | null {
    try { return new ObjectId(value); } catch { return null; }
}

/**
 * Middleware factory: gate a route on authentication AND tenant binding
 * AND role membership.
 *
 * Resolves `skb_session` (named user) first, then falls back to the
 * PIN-anonymous `skb_host` cookie. The first cookie that verifies wins —
 * the other is ignored. Behavior:
 *
 *   - 503 if `SKB_COOKIE_SECRET` is not set.
 *   - 401 if no recognizable cookie, or the best cookie fails HMAC /
 *         expiry / decode.
 *   - 403 if the cookie is valid but for a different tenant than
 *         `req.params.loc`. Body: `{ error: 'wrong_tenant' }`.
 *   - 403 if the cookie's role is not in the allowed set.
 *         Body: `{ error: 'forbidden' }`.
 *   - Otherwise attaches `req.hostAuth` and calls next().
 *
 * Legacy 2-segment `skb_host` cookies carry no tenant binding and
 * imply role='host'; they are accepted during the deprecation window
 * and logged as `auth.legacy-cookie.accept`. The caller's role must
 * still include 'host' for them to pass.
 */
export function requireRole(...roles: Role[]) {
    if (roles.length === 0) throw new Error('requireRole: at least one role required');
    const allowed = new Set<Role>(roles);
    return async function middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
        const key = secret();
        if (!key) {
            res.status(503).json({ error: 'host auth not configured' });
            return;
        }
        const paramLoc = typeof req.params?.loc === 'string' ? req.params.loc : undefined;

        // 1) skb_session — named user.
        const sessionRaw = readSessionCookie(req.headers.cookie);
        if (sessionRaw) {
            const sv = verifySessionCookie(sessionRaw, key);
            if (!sv.ok || !sv.payload) {
                res.status(401).json({ error: 'unauthorized' });
                return;
            }
            if (paramLoc && sv.payload.lid !== paramLoc) {
                emitLog({
                    level: 'warn',
                    msg: 'auth.wrong-tenant',
                    source: 'session',
                    cookieLid: sv.payload.lid,
                    paramLoc,
                    uid: sv.payload.uid,
                    ip: req.ip,
                });
                res.status(403).json({ error: 'wrong_tenant' });
                return;
            }
            if (!allowed.has(sv.payload.role)) {
                emitLog({
                    level: 'warn',
                    msg: 'auth.forbidden-role',
                    source: 'session',
                    role: sv.payload.role,
                    required: roles,
                    uid: sv.payload.uid,
                    loc: paramLoc,
                    ip: req.ip,
                });
                res.status(403).json({ error: 'forbidden' });
                return;
            }
            // Issue #55 R4: revoked membership fails at next request. The
            // cookie payload pins {uid, lid, role}; we look up the live
            // membership and 401 if it's absent or revoked, OR if the
            // role has since been downgraded and no longer includes the
            // one in the cookie. This is O(1) per request via the
            // `user_memberships` index.
            //
            // DB-unavailable fail-closed: if the lookup throws, we treat
            // the session as invalid rather than let a stale cookie
            // bypass revocation during an outage.
            try {
                const uid = safeObjectId(sv.payload.uid);
                if (!uid) {
                    res.status(401).json({ error: 'unauthorized' });
                    return;
                }
                const db = await getDb();
                const live = await membershipsColl(db).findOne({
                    userId: uid,
                    locationId: sv.payload.lid,
                    revokedAt: { $exists: false },
                });
                if (!live) {
                    emitLog({
                        level: 'warn',
                        msg: 'auth.membership-revoked',
                        uid: sv.payload.uid,
                        loc: sv.payload.lid,
                        ip: req.ip,
                    });
                    res.status(401).json({ error: 'unauthorized' });
                    return;
                }
                if (!allowed.has(live.role)) {
                    emitLog({
                        level: 'warn',
                        msg: 'auth.role-downgraded',
                        uid: sv.payload.uid,
                        loc: sv.payload.lid,
                        cookieRole: sv.payload.role,
                        liveRole: live.role,
                        required: roles,
                        ip: req.ip,
                    });
                    res.status(403).json({ error: 'forbidden' });
                    return;
                }
            } catch (err) {
                emitLog({
                    level: 'error',
                    msg: 'auth.membership-lookup.error',
                    uid: sv.payload.uid,
                    loc: sv.payload.lid,
                    err: err instanceof Error ? err.message : String(err),
                });
                res.status(503).json({ error: 'temporarily unavailable' });
                return;
            }
            req.hostAuth = {
                lid: sv.payload.lid,
                uid: sv.payload.uid,
                legacy: false,
                role: sv.payload.role,
                source: 'session',
            };
            next();
            return;
        }

        // 2) skb_host — PIN-anonymous, role always 'host'.
        const hostRaw = readCookie(req.headers.cookie);
        if (!hostRaw) {
            res.status(401).json({ error: 'unauthorized' });
            return;
        }
        const result = verifyCookieDetailed(hostRaw, key);
        if (!result.ok) {
            res.status(401).json({ error: 'unauthorized' });
            return;
        }
        if (!result.legacy && result.lid && paramLoc && result.lid !== paramLoc) {
            emitLog({
                level: 'warn',
                msg: 'auth.wrong-tenant',
                source: 'host',
                cookieLid: result.lid,
                paramLoc,
                ip: req.ip,
            });
            res.status(403).json({ error: 'wrong_tenant' });
            return;
        }
        if (!allowed.has('host')) {
            emitLog({
                level: 'warn',
                msg: 'auth.forbidden-role',
                source: 'host',
                role: 'host',
                required: roles,
                loc: paramLoc,
                ip: req.ip,
            });
            res.status(403).json({ error: 'forbidden' });
            return;
        }
        if (result.legacy) {
            emitLog({
                level: 'info',
                msg: 'auth.legacy-cookie.accept',
                loc: paramLoc,
                ip: req.ip,
            });
        }
        req.hostAuth = {
            lid: result.lid,
            legacy: result.legacy,
            role: 'host',
            source: 'host',
        };
        next();
    };
}

/**
 * Legacy middleware: 401 unless a valid host cookie is present.
 * Preserved for the unit-test suite and any pre-#52 caller. New code
 * should use `requireRole` so tenant binding is enforced.
 */
export function requireHost(req: Request, res: Response, next: NextFunction): void {
    const key = secret();
    if (!key) {
        res.status(503).json({ error: 'host auth not configured' });
        return;
    }
    const raw = readCookie(req.headers.cookie);
    if (!raw || !verifyCookie(raw, key)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    next();
}

/** Handler for POST /api/host/login. Body: { pin: string }. Legacy path. */
export function loginHandler(req: Request, res: Response): void {
    const key = secret();
    const expected = pin();
    if (!key || !expected) {
        res.status(503).json({ error: 'host auth not configured' });
        return;
    }
    const provided = String(req.body?.pin ?? '');
    if (provided.length === 0) {
        res.status(400).json({ error: 'pin required', field: 'pin' });
        return;
    }
    // timingSafeEqual requires equal-length buffers.
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    let ok = false;
    if (a.length === b.length) {
        try {
            ok = timingSafeEqual(a, b);
        } catch {
            ok = false;
        }
    }
    if (!ok) {
        emitLog({
            level: 'warn',
            msg: 'host.auth.fail',
            ip: req.ip,
        });
        res.status(401).json({ error: 'invalid pin' });
        return;
    }
    const cookie = mintCookie(new Date(), key);
    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    );
    res.json({ ok: true });
}

export function logoutHandler(_req: Request, res: Response): void {
    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    );
    res.json({ ok: true });
}

// Exported constants for reuse in routes/host.ts.
export const HOST_COOKIE_NAME = COOKIE_NAME;
export const HOST_COOKIE_MAX_AGE_SECONDS = COOKIE_MAX_AGE_SECONDS;
export { mintLocationCookie };

// Exported for tests.
export const __test__ = { mintCookie, mintLocationCookie, readCookie, sign };
