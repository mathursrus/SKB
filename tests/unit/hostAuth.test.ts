// Unit tests for HMAC-signed host cookie verification + legacy middleware handlers
import { runTests } from '../test-utils.js';
import { verifyCookie, __test__, loginHandler, logoutHandler, requireHost } from '../../src/middleware/hostAuth.js';
import type { Request, Response } from 'express';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const KEY = 'test-secret-0123456789';

/** Minimal Response mock — only the methods these middleware handlers use. */
interface ResState { status: number; body: unknown; headers: Record<string, string> }
function makeRes(): { res: Response; state: ResState } {
    const state: ResState = { status: 200, body: undefined, headers: {} };
    const res = {
        status(code: number) { state.status = code; return res; },
        json(body: unknown) { state.body = body; return res; },
        setHeader(name: string, value: string) { state.headers[name] = value; return res; },
    } as unknown as Response;
    return { res, state };
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(overrides)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try { return fn(); }
    finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

const cases: T[] = [
    {
        name: 'freshly minted cookie verifies true',
        tags: ['unit', 'auth'],
        testFn: async () => {
            const cookie = __test__.mintCookie(new Date(), KEY);
            return verifyCookie(cookie, KEY);
        },
    },
    {
        name: 'cookie signed with wrong key verifies false',
        tags: ['unit', 'auth'],
        testFn: async () => {
            const cookie = __test__.mintCookie(new Date(), KEY);
            return !verifyCookie(cookie, 'different-key');
        },
    },
    {
        name: 'tampered cookie (flipped char) verifies false',
        tags: ['unit', 'auth'],
        testFn: async () => {
            const cookie = __test__.mintCookie(new Date(), KEY);
            const dot = cookie.indexOf('.');
            const mac = cookie.slice(dot + 1);
            const flipped = mac[0] === 'a' ? 'b' + mac.slice(1) : 'a' + mac.slice(1);
            const tampered = cookie.slice(0, dot + 1) + flipped;
            return !verifyCookie(tampered, KEY);
        },
    },
    {
        name: 'expired cookie verifies false',
        tags: ['unit', 'auth'],
        testFn: async () => {
            // Mint a cookie "now", verify with a "now" one day later.
            const cookie = __test__.mintCookie(new Date(), KEY);
            const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
            return !verifyCookie(cookie, KEY, future);
        },
    },
    {
        name: 'malformed cookie verifies false',
        tags: ['unit', 'auth'],
        testFn: async () => {
            return (
                !verifyCookie('garbage', KEY) &&
                !verifyCookie('', KEY) &&
                !verifyCookie('.nodot', KEY) &&
                !verifyCookie('123.short', KEY)
            );
        },
    },
    {
        name: 'readCookie finds skb_host among other cookies',
        tags: ['unit', 'auth'],
        testFn: async () => {
            const header = 'foo=bar; skb_host=abc.def; baz=qux';
            return __test__.readCookie(header) === 'abc.def';
        },
    },
    {
        name: 'readCookie returns null without header',
        tags: ['unit', 'auth'],
        testFn: async () => __test__.readCookie(undefined) === null,
    },

    // ---------- Direct middleware handler tests (coverage) ----------
    {
        name: 'requireHost: no secret env → 503',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: undefined }, () => {
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireHost({ headers: {} } as unknown as Request, res, () => { nextState.called = true; });
                return state.status === 503 && !nextState.called;
            });
        },
    },
    {
        name: 'requireHost: missing cookie → 401',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireHost({ headers: {} } as unknown as Request, res, () => { nextState.called = true; });
                return state.status === 401 && !nextState.called;
            });
        },
    },
    {
        name: 'requireHost: tampered cookie → 401',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireHost({ headers: { cookie: 'skb_host=999.bad' } } as unknown as Request, res, () => { nextState.called = true; });
                return state.status === 401 && !nextState.called;
            });
        },
    },
    {
        name: 'requireHost: valid cookie → calls next() and does not respond',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const cookieValue = __test__.mintCookie(new Date(), KEY);
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireHost(
                    { headers: { cookie: `skb_host=${cookieValue}` } } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                return nextState.called === true && state.status === 200;
            });
        },
    },
    {
        name: 'loginHandler: missing secret or pin env → 503',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY, SKB_HOST_PIN: undefined }, () => {
                const { res, state } = makeRes();
                loginHandler({ body: { pin: '1234' } } as Request, res);
                return state.status === 503;
            });
        },
    },
    {
        name: 'loginHandler: empty pin → 400 with field=pin',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY, SKB_HOST_PIN: '1234' }, () => {
                const { res, state } = makeRes();
                loginHandler({ body: { pin: '' } } as Request, res);
                const body = state.body as { error?: string; field?: string } | undefined;
                return state.status === 400 && body?.field === 'pin';
            });
        },
    },
    {
        name: 'loginHandler: wrong pin → 401 invalid pin',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY, SKB_HOST_PIN: '1234' }, () => {
                const { res, state } = makeRes();
                loginHandler({ body: { pin: '0000' }, ip: '127.0.0.1' } as Request, res);
                return state.status === 401;
            });
        },
    },
    {
        name: 'loginHandler: correct pin → 200 + Set-Cookie with HttpOnly + Max-Age',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY, SKB_HOST_PIN: '1234' }, () => {
                const { res, state } = makeRes();
                loginHandler({ body: { pin: '1234' }, ip: '127.0.0.1' } as Request, res);
                const cookie = state.headers['Set-Cookie'] ?? '';
                const body = state.body as { ok?: boolean } | undefined;
                return body?.ok === true
                    && cookie.includes('skb_host=')
                    && cookie.includes('HttpOnly')
                    && cookie.includes('Max-Age=43200');
            });
        },
    },
    {
        name: 'logoutHandler: sends Max-Age=0 cookie to clear session',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            const { res, state } = makeRes();
            logoutHandler({} as Request, res);
            return (state.headers['Set-Cookie'] ?? '').includes('Max-Age=0');
        },
    },
    {
        name: 'loginHandler: mismatched pin lengths → 401 (timingSafeEqual branch)',
        tags: ['unit', 'auth', 'middleware', 'coverage'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY, SKB_HOST_PIN: '12345678' }, () => {
                const { res, state } = makeRes();
                loginHandler({ body: { pin: '1234' }, ip: '127.0.0.1' } as Request, res);
                return state.status === 401;
            });
        },
    },
];

void runTests(cases, 'host auth (cookie)');
