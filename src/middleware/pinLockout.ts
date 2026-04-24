// ============================================================================
// SKB - Shared PIN attempt lockout for host-login and MCP auth
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

function now(): number {
    return Date.now();
}

function freshBucket(t: number): Bucket {
    return { failures: 0, windowResetAt: t + ATTEMPT_WINDOW_MS, lockoutUntil: 0 };
}

function normalizePart(value: string | null | undefined, fallback: string): string {
    const trimmed = String(value ?? '').trim();
    return trimmed.length > 0 ? trimmed.toLowerCase() : fallback;
}

function key(scope: string, locationId: string, ip: string | null | undefined): string {
    return [
        normalizePart(scope, 'unknown-scope'),
        normalizePart(locationId, 'unknown-location'),
        normalizePart(ip, 'unknown-ip'),
    ].join(':');
}

export interface AllowResult {
    allowed: boolean;
    retryAfterSeconds?: number;
}

export function checkAllowed(scope: string, locationId: string, ip: string | null | undefined): AllowResult {
    const t = now();
    const b = store.get(key(scope, locationId, ip));
    if (!b) return { allowed: true };
    if (b.lockoutUntil > t) {
        return { allowed: false, retryAfterSeconds: Math.ceil((b.lockoutUntil - t) / 1000) };
    }
    return { allowed: true };
}

export function recordFailure(scope: string, locationId: string, ip: string | null | undefined): AllowResult {
    const t = now();
    const k = key(scope, locationId, ip);
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

export function recordSuccess(scope: string, locationId: string, ip: string | null | undefined): void {
    store.delete(key(scope, locationId, ip));
}

export function __resetForTests(): void {
    store.clear();
}

export const PIN_LOCKOUT_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const PIN_LOCKOUT_WINDOW_MS = ATTEMPT_WINDOW_MS;
export const PIN_LOCKOUT_MS = LOCKOUT_MS;
