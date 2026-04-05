// ============================================================================
// SKB - Per-IP in-memory token bucket rate limiter
// ============================================================================
//
// Single-instance, process-local. Fine for v1 (one host-stand device).
// ============================================================================

import type { Request, Response, NextFunction } from 'express';

interface Bucket {
    count: number;
    resetAt: number; // epoch ms
}

export interface RateLimitOptions {
    windowMs: number;
    max: number;
    keyFn?: (req: Request) => string;
}

export function rateLimit(opts: RateLimitOptions) {
    const store = new Map<string, Bucket>();
    const keyFn = opts.keyFn ?? ((req: Request) => req.ip ?? 'unknown');

    return function middleware(req: Request, res: Response, next: NextFunction): void {
        const key = keyFn(req);
        const now = Date.now();
        const bucket = store.get(key);
        if (!bucket || bucket.resetAt <= now) {
            store.set(key, { count: 1, resetAt: now + opts.windowMs });
            next();
            return;
        }
        if (bucket.count >= opts.max) {
            const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfter));
            res.status(429).json({ error: 'too many requests' });
            return;
        }
        bucket.count += 1;
        next();
    };
}
