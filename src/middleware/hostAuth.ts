// ============================================================================
// SKB - Host auth (PIN login + HMAC-signed cookie, tenant-scoped)
// ============================================================================
//
// Cookie format — Issue #52 introduces tenant binding.
//
//   Legacy (pre-#52):  <exp>.<mac>           where mac = HMAC(secret, String(exp))
//   Current:           <lid>.<exp>.<mac>     where mac = HMAC(secret, '<lid>.<exp>')
//
// Both formats verify successfully for two releases (the deprecation window
// defined in spec §8.4). `verifyCookieDetailed` reports which format the
// caller saw, so route handlers can emit `auth.legacy-cookie.accept` when
// the legacy format is used.
//
// Cross-tenant binding: `requireRole` extracts the `lid` from a new-format
// cookie and compares it to `req.params.loc`. A mismatch is 403 (not 401 —
// the caller IS authenticated, they just aren't authorized for THIS
// tenant). Legacy cookies carry no `lid`, so during the deprecation window
// they are accepted against any tenant and we log the event; this is the
// known-and-temporary softening.
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'skb_host';
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

/** Extract the `skb_host` cookie value from a raw `Cookie:` header. */
export function readCookie(header: string | undefined): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const name = part.slice(0, eq).trim();
        if (name === COOKIE_NAME) return part.slice(eq + 1).trim();
    }
    return null;
}

/**
 * Auth context attached to `req` once a cookie has verified. Route handlers
 * can read `req.auth.lid` (present unless the caller presented a legacy
 * cookie) and `req.auth.legacy` (true during the deprecation window).
 */
export interface HostAuthContext {
    lid?: string;
    legacy: boolean;
    /** Informational: which role the middleware gate allowed. */
    role: string;
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

/**
 * Middleware factory: gate a route on host authentication AND tenant binding.
 *
 *   - 503 if `SKB_COOKIE_SECRET` is not set.
 *   - 401 if no cookie, or the cookie fails HMAC verification / is expired /
 *         malformed.
 *   - 403 if the cookie is a valid new-format cookie for tenant X but
 *         `req.params.loc` is tenant Y. Body: `{ error: 'wrong_tenant' }`.
 *   - Otherwise attaches `req.auth = { lid, legacy, role }` and calls next().
 *
 * Legacy cookies (2-segment format) are accepted against any tenant during
 * the deprecation window and logged as `auth.legacy-cookie.accept`. They
 * will be rejected once the window closes; spec §8.4.
 *
 * The `role` parameter is informational today — a cookie does not yet
 * carry a role claim, so every authenticated host passes every role check.
 * The signature is future-proof for `skb_session` cookies (issue #53+),
 * which will add role enforcement.
 */
export function requireRole(...roles: string[]) {
    if (roles.length === 0) throw new Error('requireRole: at least one role required');
    return function middleware(req: Request, res: Response, next: NextFunction): void {
        const key = secret();
        if (!key) {
            res.status(503).json({ error: 'host auth not configured' });
            return;
        }
        const raw = readCookie(req.headers.cookie);
        if (!raw) {
            res.status(401).json({ error: 'unauthorized' });
            return;
        }
        const result = verifyCookieDetailed(raw, key);
        if (!result.ok) {
            res.status(401).json({ error: 'unauthorized' });
            return;
        }
        const paramLoc = typeof req.params?.loc === 'string' ? req.params.loc : undefined;
        if (!result.legacy && result.lid && paramLoc && result.lid !== paramLoc) {
            emitLog({
                level: 'warn',
                msg: 'auth.wrong-tenant',
                cookieLid: result.lid,
                paramLoc,
                ip: req.ip,
            });
            res.status(403).json({ error: 'wrong_tenant' });
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
        req.hostAuth = { lid: result.lid, legacy: result.legacy, role: roles[0] };
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
