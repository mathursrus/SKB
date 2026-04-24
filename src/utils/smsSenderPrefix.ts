// ============================================================================
// SKB — SMS display-name prefix helper (issue #69)
// ============================================================================
// Shared-number multi-tenancy (Framing B / Yelp pattern) requires every
// outbound body to lead with the restaurant's name so diners know who
// they're hearing from. We apply the prefix in the `sendSms` chokepoint
// rather than at each template site, so the templates stay pure body text
// and the prefix logic lives in exactly one place.

const FALLBACK_NAME = 'OSH';

/**
 * Return the body with `${senderName}: ` prepended. If the body already
 * starts with `${senderName}: ` (e.g., on a retry path that re-prefixes),
 * leave it alone — idempotent.
 *
 * senderName is resolved by the caller as `location.smsSenderName ||
 * location.name || "OSH"`. We take it as an already-resolved string so
 * the prefix helper itself has zero IO dependency and stays trivial to
 * unit-test.
 */
export function applySenderPrefix(body: string, senderName: string | undefined | null): string {
    const name = (senderName ?? '').trim() || FALLBACK_NAME;
    const prefix = `${name}: `;
    if (body.startsWith(prefix)) return body;
    return prefix + body;
}

export { FALLBACK_NAME as SMS_SENDER_FALLBACK_NAME };
