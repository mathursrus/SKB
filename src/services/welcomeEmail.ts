// ============================================================================
// SKB - Welcome-email dispatch (issue #54)
// ============================================================================
//
// Spec §6.1: "We send a welcome email with a link back to the admin (for
// session continuity across devices)."
//
// v1 is intentionally a stub. We emit one structured log line so dev can
// see what would have been sent, and so a future prod-ready implementation
// (nodemailer, Azure Communication Services Email, etc.) can drop in
// without touching any caller.
//
// Shape of the log line is consistent with the other `emit*` helpers in
// this codebase: single-line JSON with `t`, `msg`, and the relevant
// fields.
// ============================================================================

import type { PublicUser } from '../types/identity.js';

export interface WelcomeEmailInput {
    user: PublicUser;
    locationId: string;
    hostPin: string;
    /**
     * Absolute URL to the admin workspace the owner should land on.
     * Caller builds this so the service doesn't have to know about the
     * request's Host/protocol.
     */
    adminUrl: string;
}

/**
 * Send (or in v1: log) the welcome email. Never throws — a mail failure
 * must not break signup. The owner already has a live session cookie at
 * this point, so missing the email is recoverable (they're already logged
 * in); surfacing the error would force us to also roll back the signup,
 * which is a worse UX for a "nice to have" side effect.
 */
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
    try {
        const subject = 'Welcome to the platform';
        const body = [
            `Hi ${input.user.name},`,
            '',
            `Your restaurant is live. You can open your admin at:`,
            input.adminUrl,
            '',
            `Your host-stand PIN is ${input.hostPin}. Keep it somewhere safe — this is the only time we\u2019ll show it in plain text.`,
            '',
            'If you get stuck, reply to this email or write to hello@example.com.',
        ].join('\n');

        // eslint-disable-next-line no-console -- intentional dev/prod stub
        console.log(JSON.stringify({
            t: new Date().toISOString(),
            level: 'info',
            msg: 'welcome_email.send',
            to: input.user.email,
            subject,
            locationId: input.locationId,
            adminUrl: input.adminUrl,
            // Never log the plain-text body in production mode. For v1 dev
            // inspection we include the body; the operator can disable this
            // by setting SKB_LOG_EMAIL_BODY=0.
            body: process.env.SKB_LOG_EMAIL_BODY === '0' ? undefined : body,
        }));
    } catch {
        // Intentional: swallow. Welcome email is a side-effect; signup is
        // already committed by this point.
    }
}
