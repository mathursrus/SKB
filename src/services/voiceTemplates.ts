// ============================================================================
// SKB — Voice IVR templates and helpers
// ============================================================================

/** Spell out a pickup code for voice: "SKB-7Q3" → "S, K, B, dash, 7, Q, 3" */
export function spellOutCode(code: string): string {
    return code.split('').map(ch => ch === '-' ? 'dash' : ch).join(', ');
}

/** Spell out a phone number digit by digit: "2065551234" → "2, 0, 6, 5, 5, 5, 1, 2, 3, 4" */
export function spellOutPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    const digits = cleaned.length === 11 && cleaned.startsWith('1') ? cleaned.slice(1) : cleaned;
    return digits.split('').join(', ');
}

/** Format ETA for speech: 48 → "about 48 minutes", 0 → "less than a minute" */
export function formatEtaForSpeech(minutes: number): string {
    if (minutes <= 0) return 'less than a minute';
    if (minutes === 1) return 'about 1 minute';
    return `about ${minutes} minutes`;
}

/**
 * Format an absolute ETA timestamp as wall-clock time in the project timezone.
 * Example: new Date('2026-04-10T02:42:00Z') → "7:42 PM" (in America/Los_Angeles).
 *
 * Uses TZ env var if set, otherwise defaults to America/Los_Angeles to match
 * the project's serviceDay convention.
 */
export function formatEtaWallClock(etaAt: string | Date): string {
    const d = typeof etaAt === 'string' ? new Date(etaAt) : etaAt;
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: process.env.TZ || 'America/Los_Angeles',
    }).format(d);
}

/** Strip +1 country code from Twilio From: "+12065551234" → "2065551234" */
export function normalizeCallerPhone(from: string | undefined): string {
    if (!from) return '';
    const cleaned = from.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return cleaned.slice(1);
    }
    return cleaned;
}

/** Escape XML special characters to prevent TwiML injection */
export function escXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
