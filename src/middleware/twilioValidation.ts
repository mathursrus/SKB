// ============================================================================
// SKB — Twilio webhook signature validation middleware
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';

/**
 * Express middleware that validates Twilio webhook signatures.
 * Skips validation if TWILIO_AUTH_TOKEN is not set (development mode).
 */
export function validateTwilioSignature(req: Request, res: Response, next: NextFunction): void {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
        next();
        return;
    }

    const signature = req.headers['x-twilio-signature'] as string;
    if (!signature) {
        console.log(JSON.stringify({
            t: new Date().toISOString(), level: 'warn',
            msg: 'voice.missing_signature', path: req.originalUrl,
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
            msg: 'voice.invalid_signature', path: req.originalUrl,
        }));
        res.status(403).send('Forbidden');
        return;
    }
    next();
}
