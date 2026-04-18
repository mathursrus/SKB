// ============================================================================
// SKB - Owner signup route (issue #54, spec §6.1 + §8.5)
// ============================================================================
//
// Single POST /api/signup endpoint that:
//   1. Rate-limits to 5 per IP per hour (anti-abuse per spec §8.5)
//   2. Provisions Location + User + Membership (services/signup)
//   3. Mints an skb_session cookie so the owner is immediately logged in
//   4. Fires a welcome email (v1: logs it; prod-ready: nodemailer, stubbed)
//   5. Returns a shape the signup page uses to redirect to
//      /r/{slug}/admin.html
//
// Error shape is consistent with /api/login:
//   400 { error, field? } — validation
//   409 { error, field }  — email / slug conflict
//   429 { error }         — rate limit / lockout
//   503 { error }         — SKB_COOKIE_SECRET missing
// ============================================================================

import { Router, type Request, type Response } from 'express';

import { rateLimit } from '../middleware/rateLimit.js';
import {
    signupOwner,
    SignupValidationError,
    SignupConflictError,
} from '../services/signup.js';
import { sendWelcomeEmail } from '../services/welcomeEmail.js';
import {
    mintSessionCookie,
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_MAX_AGE_SECONDS,
} from '../middleware/hostAuth.js';
import type { SessionPayload } from '../types/identity.js';

const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
// Default spec §8.5 limit is 5/IP/hour. Tests can raise it via the env var
// (the rate-limit test bypasses by resetting the module between runs isn't
// practical, and CI runs share the process). In prod the env var is unset
// and we use the spec value.
const SIGNUP_MAX_PER_WINDOW = (() => {
    const raw = process.env.SKB_SIGNUP_MAX_PER_WINDOW;
    if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
    return 5;
})();

function cookieSecret(): string | null {
    return process.env.SKB_COOKIE_SECRET ?? null;
}

function emitLog(obj: Record<string, unknown>): void {
    // eslint-disable-next-line no-console -- structured JSON logging
    console.log(JSON.stringify({ t: new Date().toISOString(), ...obj }));
}

function absoluteAdminUrl(req: Request, slug: string): string {
    // Prefer the Host header so the URL matches whatever domain the owner
    // signed up from (makes the welcome link clickable on their device). If
    // missing (curl with no Host), fall back to localhost so dev still works.
    const host = String(req.headers.host ?? `localhost:${process.env.PORT ?? '3000'}`);
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'http';
    return `${proto}://${host}/r/${slug}/admin.html`;
}

export function signupRouter(): Router {
    const r = Router();

    const limiter = rateLimit({
        windowMs: SIGNUP_WINDOW_MS,
        max: SIGNUP_MAX_PER_WINDOW,
    });

    r.post('/signup', limiter, async (req: Request, res: Response) => {
        const key = cookieSecret();
        if (!key) { res.status(503).json({ error: 'auth not configured' }); return; }

        const body = (req.body ?? {}) as {
            restaurantName?: unknown;
            city?: unknown;
            ownerName?: unknown;
            email?: unknown;
            password?: unknown;
            slug?: unknown;
            tosAccepted?: unknown;
        };

        // The ToS checkbox is a UX affordance, not a server contract. We
        // require it defensively so the public signup page can't be
        // bypassed by a scripted caller that ignores the checkbox — the
        // spec shows it as a required field.
        if (body.tosAccepted !== true && body.tosAccepted !== 'true' && body.tosAccepted !== 'on') {
            res.status(400).json({ error: 'must accept terms', field: 'tosAccepted' });
            return;
        }

        try {
            const result = await signupOwner({
                restaurantName: String(body.restaurantName ?? ''),
                city: String(body.city ?? ''),
                ownerName: String(body.ownerName ?? ''),
                email: String(body.email ?? ''),
                password: String(body.password ?? ''),
                slug: typeof body.slug === 'string' && body.slug.trim().length > 0
                    ? body.slug.trim()
                    : undefined,
            });

            // Mint cookie → owner lands on admin logged in.
            const exp = Math.floor(Date.now() / 1000) + SESSION_COOKIE_MAX_AGE_SECONDS;
            const payload: SessionPayload = {
                uid: result.user.id,
                lid: result.location.id,
                role: 'owner',
                exp,
            };
            const cookie = mintSessionCookie(payload, key);
            res.setHeader(
                'Set-Cookie',
                `${SESSION_COOKIE_NAME}=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
            );

            // Fire welcome email (async but we don't await — the owner's
            // signup response shouldn't block on SMTP).
            const adminUrl = absoluteAdminUrl(req, result.location.id);
            void sendWelcomeEmail({
                user: result.user,
                locationId: result.location.id,
                hostPin: result.hostPin,
                adminUrl,
            });

            emitLog({
                level: 'info',
                msg: 'signup.ok',
                email: result.user.email,
                uid: result.user.id,
                loc: result.location.id,
                ip: req.ip,
            });

            res.status(201).json({
                ok: true,
                location: result.location,
                // PIN is returned here ONCE so the signup-complete screen can show it.
                hostPin: result.hostPin,
                user: result.user,
                membership: result.membership,
                redirectTo: `/r/${result.location.id}/admin.html`,
            });
        } catch (err) {
            if (err instanceof SignupValidationError) {
                emitLog({ level: 'warn', msg: 'signup.validation', field: err.field, detail: err.message, ip: req.ip });
                res.status(400).json({ error: err.message, field: err.field });
                return;
            }
            if (err instanceof SignupConflictError) {
                emitLog({ level: 'warn', msg: 'signup.conflict', field: err.field, detail: err.message, ip: req.ip });
                res.status(409).json({ error: err.message, field: err.field });
                return;
            }
            emitLog({ level: 'error', msg: 'signup.error', detail: err instanceof Error ? err.message : String(err), ip: req.ip });
            res.status(500).json({ error: 'signup failed' });
        }
    });

    return r;
}
