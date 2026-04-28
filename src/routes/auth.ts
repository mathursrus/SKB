// ============================================================================
// SKB - Platform auth routes (named-user login, logout, password reset)
// ============================================================================
//
// Issue #53, spec §8.5.
//
// These endpoints live at the platform root (no `/r/:loc/` prefix) —
// they are the unified login surface shared across tenants. The
// skb_session cookie they mint IS tenant-scoped (encodes `lid`), but
// the login URL itself is not.
//
// Routes:
//   POST /api/login                        — email + password → skb_session
//   POST /api/logout                        — clears skb_session AND skb_host
//   GET  /api/me                            — current session info (or 401)
//   POST /api/password-reset/request        — start reset flow
//   POST /api/password-reset/confirm        — finish reset flow with token
// ============================================================================

import { Router, type Request, type Response } from 'express';

import {
    findUserByEmail,
    findUserById,
    listActiveMembershipsForUser,
    findActiveMembership,
    verifyPassword,
    normalizeEmail,
    setUserPassword,
    validatePassword,
    toPublicUser,
    toPublicMembership,
} from '../services/users.js';
import {
    createResetToken,
    consumeResetToken,
    logResetEmail,
} from '../services/passwordResets.js';
import {
    acceptInvite,
    findInviteByToken,
} from '../services/invites.js';
import {
    mintSessionCookie,
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_MAX_AGE_SECONDS,
    HOST_COOKIE_NAME,
} from '../middleware/hostAuth.js';
import {
    checkAllowed,
    recordFailure,
    recordSuccess,
} from '../middleware/loginLockout.js';
import type { SessionPayload } from '../types/identity.js';

function cookieSecret(): string | null {
    return process.env.SKB_COOKIE_SECRET ?? null;
}

function emitLog(obj: Record<string, unknown>): void {
    console.log(JSON.stringify({ t: new Date().toISOString(), ...obj }));
}

function setSessionCookieHeader(res: Response, value: string): void {
    // Path=/ so the cookie flows to BOTH the unified /api/* routes and the
    // per-location /r/:loc/api/* routes. SameSite=Lax matches the host
    // cookie so a staff member clicking an email link back into the admin
    // doesn't lose their session.
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    );
}

function clearBothCookies(res: Response): void {
    // Set-Cookie twice to clear both named cookies. Must pass the array to
    // setHeader — setHeader('Set-Cookie', string) would overwrite.
    res.setHeader('Set-Cookie', [
        `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        `${HOST_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    ]);
}

export function authRouter(): Router {
    const r = Router();

    // ------------------------------------------------------------------
    // POST /api/login  { email, password, locationId? }
    //
    // Response shapes:
    //   200 { ok: true, user, role, locationId }             — single active membership (cookie set to that location)
    //   200 { ok: true, pickLocation: true, memberships }    — multiple active memberships; no cookie yet
    //   400 { error: 'invalid input', field }                 — bad request shape
    //   401 { error: 'invalid credentials' }                   — generic for unknown user OR wrong password
    //   403 { error: 'no membership' }                         — authenticated but has no active membership
    //   403 { error: 'no membership at location' }             — with locationId, user has none there
    //   429 { error: 'too many attempts' }                     — lockout engaged
    //   503 { error: 'auth not configured' }                   — SKB_COOKIE_SECRET missing
    //
    // Generic-error choice: spec §9.2 mandates "generic 'too many attempts' message"
    // and (by extension — OWASP ASVS 3.2.1) generic "invalid credentials"
    // for any auth failure. So a wrong-password response is indistinguishable
    // from an unknown-email response.
    // ------------------------------------------------------------------
    r.post('/login', async (req: Request, res: Response) => {
        const key = cookieSecret();
        if (!key) { res.status(503).json({ error: 'auth not configured' }); return; }

        const body = (req.body ?? {}) as { email?: unknown; password?: unknown; locationId?: unknown };
        const rawEmail = typeof body.email === 'string' ? body.email : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const wantedLocation = typeof body.locationId === 'string' && body.locationId.length > 0
            ? body.locationId
            : null;

        const email = normalizeEmail(rawEmail);
        if (!email) { res.status(400).json({ error: 'email required', field: 'email' }); return; }
        if (!password) { res.status(400).json({ error: 'password required', field: 'password' }); return; }

        // Lockout check BEFORE any DB work — the whole point is to throttle.
        const allow = checkAllowed(email);
        if (!allow.allowed) {
            res.setHeader('Retry-After', String(allow.retryAfterSeconds ?? 900));
            emitLog({ level: 'warn', msg: 'login.lockout', email, ip: req.ip });
            res.status(429).json({ error: 'too many attempts' });
            return;
        }

        const user = await findUserByEmail(email);
        const ok = user ? await verifyPassword(user.passwordHash, password) : false;
        if (!user || !ok) {
            const after = recordFailure(email);
            emitLog({ level: 'warn', msg: 'login.fail', email, ip: req.ip });
            if (!after.allowed) {
                res.setHeader('Retry-After', String(after.retryAfterSeconds ?? 900));
                res.status(429).json({ error: 'too many attempts' });
                return;
            }
            res.status(401).json({ error: 'invalid credentials' });
            return;
        }

        // Valid password. Look up memberships.
        const memberships = await listActiveMembershipsForUser(user._id);
        if (memberships.length === 0) {
            recordSuccess(email);
            emitLog({ level: 'warn', msg: 'login.no-membership', email, uid: user._id.toHexString(), ip: req.ip });
            res.status(403).json({ error: 'no membership' });
            return;
        }

        // If the caller specified a location, use it (must be a member there).
        // If not, and they have exactly one, pick it. Otherwise the client
        // must re-POST with locationId set (picker flow).
        let chosen = memberships[0];
        if (wantedLocation) {
            const match = memberships.find(m => m.locationId === wantedLocation);
            if (!match) {
                recordSuccess(email);
                emitLog({ level: 'warn', msg: 'login.wrong-location', email, wantedLocation, ip: req.ip });
                res.status(403).json({ error: 'no membership at location' });
                return;
            }
            chosen = match;
        } else if (memberships.length > 1) {
            // Caller hasn't picked; return the picker payload.
            recordSuccess(email);
            res.json({
                ok: true,
                pickLocation: true,
                user: toPublicUser(user),
                memberships: memberships.map(toPublicMembership),
            });
            return;
        }

        const exp = Math.floor(Date.now() / 1000) + SESSION_COOKIE_MAX_AGE_SECONDS;
        const payload: SessionPayload = {
            uid: user._id.toHexString(),
            lid: chosen.locationId,
            role: chosen.role,
            exp,
        };
        const cookie = mintSessionCookie(payload, key);
        setSessionCookieHeader(res, cookie);
        recordSuccess(email);
        emitLog({
            level: 'info',
            msg: 'login.ok',
            email,
            uid: payload.uid,
            loc: payload.lid,
            role: payload.role,
            ip: req.ip,
        });
        res.json({
            ok: true,
            user: toPublicUser(user),
            role: chosen.role,
            locationId: chosen.locationId,
        });
    });

    // ------------------------------------------------------------------
    // POST /api/logout — clears BOTH skb_session and skb_host so a staff
    // member who also PINed in on a tablet gets a clean slate. Idempotent.
    // ------------------------------------------------------------------
    r.post('/logout', (_req: Request, res: Response) => {
        clearBothCookies(res);
        res.json({ ok: true });
    });

    // ------------------------------------------------------------------
    // GET /api/me — cheap probe for the SPA to decide what to render.
    // Returns 401 if no valid session (does NOT fall through to PIN cookie —
    // /me is specifically about named identity).
    // ------------------------------------------------------------------
    r.get('/me', async (req: Request, res: Response) => {
        const key = cookieSecret();
        if (!key) { res.status(503).json({ error: 'auth not configured' }); return; }
        const raw = readSessionCookieFromHeader(req.headers.cookie);
        if (!raw) { res.status(401).json({ error: 'unauthorized' }); return; }
        const { verifySessionCookie } = await import('../middleware/hostAuth.js');
        const v = verifySessionCookie(raw, key);
        if (!v.ok || !v.payload) { res.status(401).json({ error: 'unauthorized' }); return; }
        const user = await findUserById(v.payload.uid);
        if (!user) { res.status(401).json({ error: 'unauthorized' }); return; }
        res.json({
            user: toPublicUser(user),
            locationId: v.payload.lid,
            role: v.payload.role,
        });
    });

    // ------------------------------------------------------------------
    // POST /api/password-reset/request { email }
    //
    // Always returns 200 with a generic body so the caller can't learn
    // whether an email is registered. If the email matches a user, we
    // mint a token and log the reset link (dev) or hand it to the mailer
    // (prod, future).
    // ------------------------------------------------------------------
    r.post('/password-reset/request', async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { email?: unknown };
        const email = normalizeEmail(typeof body.email === 'string' ? body.email : '');
        if (!email) {
            res.status(400).json({ error: 'email required', field: 'email' });
            return;
        }
        try {
            const user = await findUserByEmail(email);
            if (user) {
                const { token } = await createResetToken(user._id);
                logResetEmail(user, token);
            }
        } catch (err) {
            // Swallow errors to avoid side-channel leakage. Real failure would
            // show up in server logs.
            emitLog({ level: 'error', msg: 'password_reset.request.error', detail: err instanceof Error ? err.message : String(err) });
        }
        // Generic response either way.
        res.json({ ok: true });
    });

    // ------------------------------------------------------------------
    // POST /api/password-reset/confirm { token, password }
    //
    // 400 on missing fields or weak password.
    // 401 if the token is missing/expired/already-used.
    // 200 on success.
    // ------------------------------------------------------------------
    r.post('/password-reset/confirm', async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { token?: unknown; password?: unknown };
        const token = typeof body.token === 'string' ? body.token : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!token) { res.status(400).json({ error: 'token required', field: 'token' }); return; }
        if (!password) { res.status(400).json({ error: 'password required', field: 'password' }); return; }
        try {
            validatePassword(password);
        } catch (err) {
            res.status(400).json({ error: err instanceof Error ? err.message : 'invalid password', field: 'password' });
            return;
        }
        const userId = await consumeResetToken(token);
        if (!userId) { res.status(401).json({ error: 'invalid or expired token' }); return; }
        await setUserPassword(userId, password);
        emitLog({ level: 'info', msg: 'password_reset.confirm', uid: userId.toHexString(), ip: req.ip });
        res.json({ ok: true });
    });

    // ------------------------------------------------------------------
    // Issue #55: accept-invite flow
    //
    // GET  /api/accept-invite?t=<token>        — peek at an invite to
    //                                            pre-fill the accept
    //                                            form. Returns
    //                                            { email, name, role, locationId }
    //                                            or 410 if stale.
    //
    // POST /api/accept-invite { token, password, name? }
    //                                          — provision user +
    //                                            membership, mint
    //                                            skb_session.
    // ------------------------------------------------------------------
    r.get('/accept-invite', async (req: Request, res: Response) => {
        const token = typeof req.query.t === 'string' ? req.query.t : '';
        if (!token) { res.status(400).json({ error: 'token required', field: 't' }); return; }
        try {
            const invite = await findInviteByToken(token);
            if (!invite) {
                res.status(410).json({ error: 'invalid or expired invite' });
                return;
            }
            const existingUser = invite.name
                ? null
                : await findUserByEmail(invite.email);
            res.json({
                email: invite.email,
                name: invite.name || existingUser?.name || '',
                role: invite.role,
                locationId: invite.locationId,
                expiresAt: invite.expiresAt,
            });
        } catch (err) {
            emitLog({ level: 'error', msg: 'accept_invite.peek.error', detail: err instanceof Error ? err.message : String(err) });
            res.status(503).json({ error: 'temporarily unavailable' });
        }
    });

    r.post('/accept-invite', async (req: Request, res: Response) => {
        const key = cookieSecret();
        if (!key) { res.status(503).json({ error: 'auth not configured' }); return; }
        const body = (req.body ?? {}) as { token?: unknown; password?: unknown; name?: unknown };
        const token = typeof body.token === 'string' ? body.token : '';
        const password = typeof body.password === 'string' ? body.password : '';
        const name = typeof body.name === 'string' ? body.name : undefined;
        if (!token) { res.status(400).json({ error: 'token required', field: 'token' }); return; }
        if (!password) { res.status(400).json({ error: 'password required', field: 'password' }); return; }
        try {
            const result = await acceptInvite({ token, password, name });
            const exp = Math.floor(Date.now() / 1000) + SESSION_COOKIE_MAX_AGE_SECONDS;
            const payload: SessionPayload = {
                uid: result.user.id,
                lid: result.locationId,
                role: result.role,
                exp,
            };
            const cookie = mintSessionCookie(payload, key);
            setSessionCookieHeader(res, cookie);
            emitLog({
                level: 'info',
                msg: 'invite.accepted',
                uid: payload.uid,
                loc: payload.lid,
                role: payload.role,
                ip: req.ip,
            });
            res.json({
                ok: true,
                user: result.user,
                role: result.role,
                locationId: result.locationId,
            });
        } catch (err) {
            if (err instanceof Error) {
                const msg = err.message;
                if (msg === 'invalid or expired token') {
                    res.status(401).json({ error: msg });
                    return;
                }
                if (msg === 'token required'
                    || msg.startsWith('password')
                    || msg.startsWith('name')
                    || msg === 'email already registered') {
                    res.status(400).json({ error: msg });
                    return;
                }
            }
            emitLog({ level: 'error', msg: 'accept_invite.error', detail: err instanceof Error ? err.message : String(err) });
            res.status(503).json({ error: 'temporarily unavailable' });
        }
    });

    return r;
}

/**
 * Local cookie reader — kept narrow to avoid importing the full hostAuth
 * module into a route that already takes it as a peer. Duplicates a
 * one-line helper rather than add a circular import.
 */
function readSessionCookieFromHeader(header: string | undefined): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const name = part.slice(0, eq).trim();
        if (name === SESSION_COOKIE_NAME) return part.slice(eq + 1).trim();
    }
    return null;
}
