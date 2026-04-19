// ============================================================================
// SKB - Party pickup code generation (e.g., "ABCD-7Q3", "SKB-7Q3")
// ============================================================================
//
// Multi-tenant: the prefix is derived from the location's slug, so each
// restaurant's diners see codes branded with their own restaurant. The
// existing SKB Bellevue tenant (slug "skb") continues to produce "SKB-XYZ"
// codes byte-for-byte, preserving spec G5.

import { randomInt } from 'node:crypto';

// Avoid visually confusable chars: no 0/O, 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Cap prefix length so codes stay readable (SMS + QR display).
const MAX_PREFIX_LEN = 4;

/** Generate a random 3-char suffix. */
function randomSuffix(): string {
    const n = ALPHABET.length;
    return (
        ALPHABET[randomInt(0, n)] +
        ALPHABET[randomInt(0, n)] +
        ALPHABET[randomInt(0, n)]
    );
}

/** Derive the code prefix from a location slug. Takes up to MAX_PREFIX_LEN
 * alphanumeric chars from the slug, uppercased. Falls back to 'R' if the
 * slug has no alphanumerics — should never happen because slugs are
 * validated at signup, but the fallback makes this function total.
 */
export function prefixForLocation(locationId: string): string {
    const alphaNum = (locationId ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (alphaNum.length === 0) return 'R';
    return alphaNum.slice(0, MAX_PREFIX_LEN);
}

/** Format: `<PREFIX>-XYZ`, where PREFIX is derived from the location slug
 * (1–4 uppercased alphanumeric chars) and suffix chars come from the
 * unambiguous alphabet. Examples: `SKB-7Q3`, `ABCD-9FK`, `TCS-MP2`.
 */
export function generateCode(locationId: string): string {
    return `${prefixForLocation(locationId)}-${randomSuffix()}`;
}

/** True if `code` matches the `<PREFIX>-XYZ` shape and the suffix uses
 * only the allowed unambiguous alphabet. Tenant-agnostic: the prefix
 * can be any 1–10 uppercased alphanumerics.
 */
export function isValidCodeFormat(code: string): boolean {
    const m = /^([A-Z0-9]{1,10})-([A-Z2-9]{3})$/.exec(code);
    if (!m) return false;
    const suffix = m[2];
    for (const c of suffix) {
        if (!ALPHABET.includes(c)) return false;
    }
    return true;
}

export const CODE_ALPHABET = ALPHABET;
