// ============================================================================
// SKB - Party pickup code generation (e.g., "SKB-7Q3")
// ============================================================================

import { randomInt } from 'node:crypto';

// Avoid visually confusable chars: no 0/O, 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Generate a random 3-char suffix. */
function randomSuffix(): string {
    const n = ALPHABET.length;
    return (
        ALPHABET[randomInt(0, n)] +
        ALPHABET[randomInt(0, n)] +
        ALPHABET[randomInt(0, n)]
    );
}

/** Format: `SKB-XYZ`, chars from the unambiguous alphabet. */
export function generateCode(): string {
    return `SKB-${randomSuffix()}`;
}

/** True if `code` matches the SKB-XYZ shape and uses only allowed chars. */
export function isValidCodeFormat(code: string): boolean {
    if (!code.startsWith('SKB-') || code.length !== 7) return false;
    for (let i = 4; i < 7; i++) {
        if (!ALPHABET.includes(code[i])) return false;
    }
    return true;
}

export const CODE_ALPHABET = ALPHABET;
