// ============================================================================
// SKB - Per-email login attempt tracker (issue #53)
// ============================================================================
//
// Spec §9.2: 5 failed attempts per email in 15 minutes triggers a 15-minute
// lockout, and the caller gets a generic "too many attempts" error.
//
// In-memory only — matches the existing rateLimit.ts pattern. The
// single-instance assumption is the same one host-PIN lockout makes today:
// fine for v1, revisit when we move beyond a single app container.
//
// Shape:
//   * checkAllowed(email) → { allowed: true } | { allowed: false, retryAfterSeconds }
//   * recordFailure(email) → mutates the bucket, records attempt + lockout
//   * recordSuccess(email) → clears the bucket so a user who correctly
//     logs in after 4 failures doesn't carry stale failure counts forward.
//
// Lockout is keyed by the lowercased email so an attacker can't spread
// attempts across case variants. Unknown emails are tracked the same as
// real ones — if we only counted failures against real accounts, a
// learner could probe whether an email exists by seeing when lockouts
// kick in.
// ============================================================================

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

interface Bucket {
    failures: number;
    windowResetAt: number;
    lockoutUntil: number;
}

const store = new Map<string, Bucket>();

function key(email: string): string {
    return String(email ?? '').trim().toLowerCase();
}

function now(): number {
    return Date.now();
}

function freshBucket(t: number): Bucket {
    return { failures: 0, windowResetAt: t + ATTEMPT_WINDOW_MS, lockoutUntil: 0 };
}

export interface AllowResult {
    allowed: boolean;
    /** Seconds until the caller may retry. Present iff allowed=false. */
    retryAfterSeconds?: number;
}

export function checkAllowed(email: string): AllowResult {
    const k = key(email);
    if (!k) return { allowed: true };
    const t = now();
    const b = store.get(k);
    if (!b) return { allowed: true };
    if (b.lockoutUntil > t) {
        return { allowed: false, retryAfterSeconds: Math.ceil((b.lockoutUntil - t) / 1000) };
    }
    return { allowed: true };
}

export function recordFailure(email: string): AllowResult {
    const k = key(email);
    if (!k) return { allowed: true };
    const t = now();
    let b = store.get(k);
    if (!b || b.windowResetAt <= t) {
        b = freshBucket(t);
        store.set(k, b);
    }
    b.failures += 1;
    if (b.failures >= MAX_ATTEMPTS) {
        b.lockoutUntil = t + LOCKOUT_MS;
        return { allowed: false, retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000) };
    }
    return { allowed: true };
}

export function recordSuccess(email: string): void {
    const k = key(email);
    if (!k) return;
    store.delete(k);
}

/** Test-only: drop all stored buckets. */
export function __resetForTests(): void {
    store.clear();
}

// Exported constants for test-time consistency checks.
export const LOGIN_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const LOGIN_ATTEMPT_WINDOW_MS = ATTEMPT_WINDOW_MS;
export const LOGIN_LOCKOUT_MS = LOCKOUT_MS;
