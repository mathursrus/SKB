// ============================================================================
// SKB - Host auth (PIN login + HMAC-signed cookie)
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'skb_host';
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60; // 12h

function secret(): string | null {
    return process.env.SKB_COOKIE_SECRET ?? null;
}

function pin(): string | null {
    return process.env.SKB_HOST_PIN ?? null;
}

function sign(payload: string, key: string): string {
    return createHmac('sha256', key).update(payload).digest('hex');
}

/** Build a cookie value `<exp>.<hmac>` where exp is epoch seconds. */
function mintCookie(now: Date, key: string): string {
    const exp = Math.floor(now.getTime() / 1000) + COOKIE_MAX_AGE_SECONDS;
    const mac = sign(String(exp), key);
    return `${exp}.${mac}`;
}

/** Returns true if the cookie value is well-formed and currently valid. */
export function verifyCookie(value: string, key: string, now: Date = new Date()): boolean {
    const dot = value.indexOf('.');
    if (dot < 1) return false;
    const expStr = value.slice(0, dot);
    const got = value.slice(dot + 1);
    if (!/^\d+$/.test(expStr) || got.length !== 64) return false;
    const exp = parseInt(expStr, 10);
    if (exp * 1000 <= now.getTime()) return false;
    const expected = sign(expStr, key);
    try {
        return timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
        return false;
    }
}

/** Extract the `skb_host` cookie value from a raw `Cookie:` header. */
function readCookie(header: string | undefined): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const name = part.slice(0, eq).trim();
        if (name === COOKIE_NAME) return part.slice(eq + 1).trim();
    }
    return null;
}

/** Middleware: 401 unless a valid host cookie is present. */
export function requireHost(req: Request, res: Response, next: NextFunction): void {
    const key = secret();
    if (!key) {
        res.status(503).json({ error: 'host auth not configured' });
        return;
    }
    const raw = readCookie(req.headers.cookie);
    if (!raw || !verifyCookie(raw, key)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    next();
}

/** Handler for POST /api/host/login. Body: { pin: string } */
export function loginHandler(req: Request, res: Response): void {
    const key = secret();
    const expected = pin();
    if (!key || !expected) {
        res.status(503).json({ error: 'host auth not configured' });
        return;
    }
    const provided = String(req.body?.pin ?? '');
    if (provided.length === 0) {
        res.status(400).json({ error: 'pin required', field: 'pin' });
        return;
    }
    // timingSafeEqual requires equal-length buffers.
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    let ok = false;
    if (a.length === b.length) {
        try {
            ok = timingSafeEqual(a, b);
        } catch {
            ok = false;
        }
    }
    if (!ok) {
        console.log(
            JSON.stringify({
                t: new Date().toISOString(),
                level: 'warn',
                msg: 'host.auth.fail',
                ip: req.ip,
            }),
        );
        res.status(401).json({ error: 'invalid pin' });
        return;
    }
    const cookie = mintCookie(new Date(), key);
    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    );
    res.json({ ok: true });
}

export function logoutHandler(_req: Request, res: Response): void {
    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    );
    res.json({ ok: true });
}

// Exported for tests.
export const __test__ = { mintCookie, readCookie, sign };
