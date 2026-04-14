// ============================================================================
// SKB — Twilio webhook signature validation middleware
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';

/**
 * Express middleware that validates Twilio webhook signatures.
 *
 * Default behavior: **strict**. If `TWILIO_AUTH_TOKEN` is unset the endpoint
 * returns 503 — production MUST have the token configured, and a missing
 * token in a webhook-facing deployment is a misconfiguration.
 *
 * Local development escape hatch: set `SKB_ALLOW_UNSIGNED_TWILIO=1` to
 * explicitly bypass signature checking. This is required now (previously the
 * middleware silently opened up whenever TWILIO_AUTH_TOKEN was absent, which
 * was a latent security footgun — see bug bash BB-05 for the original
 * triage and docs/evidence/37-bug-bash.md for the rationale).
 */
export function validateTwilioSignature(req: Request, res: Response, next: NextFunction): void {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
        if (process.env.SKB_ALLOW_UNSIGNED_TWILIO === '1') {
            console.log(JSON.stringify({
                t: new Date().toISOString(), level: 'warn',
                msg: 'twilio.signature_bypassed_dev', path: req.originalUrl,
            }));
            next();
            return;
        }
        console.log(JSON.stringify({
            t: new Date().toISOString(), level: 'error',
            msg: 'twilio.not_configured', path: req.originalUrl,
        }));
        res.status(503).send('Service Unavailable');
        return;
    }

    const signature = req.headers['x-twilio-signature'] as string;
    if (!signature) {
        console.log(JSON.stringify({
            t: new Date().toISOString(), level: 'warn',
            msg: 'twilio.missing_signature', path: req.originalUrl,
        }));
        res.status(403).send('Forbidden');
        return;
    }

    const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
    const url = `${proto}://${host}${req.originalUrl}`;
    const isValid = twilio.validateRequest(authToken, signature, url, req.body);

    if (!isValid) {
        console.log(JSON.stringify({
            t: new Date().toISOString(), level: 'warn',
            msg: 'twilio.invalid_signature', path: req.originalUrl,
        }));
        res.status(403).send('Forbidden');
        return;
    }
    next();
}
