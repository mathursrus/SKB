// Unit tests for HMAC-signed host cookie verification + legacy middleware handlers
import { runTests } from '../test-utils.js';
import { verifyCookie, verifyCookieDetailed, __test__, loginHandler, logoutHandler, requireHost, requireRole, mintSessionCookie, verifySessionCookie, SESSION_COOKIE_NAME } from '../../src/middleware/hostAuth.js';
import type { SessionPayload } from '../../src/types/identity.js';
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

    // ---------- Issue #52: new location-scoped cookie format ----------
    {
        name: 'mintLocationCookie: produces <lid>.<exp>.<mac> with lid included in MAC input',
        tags: ['unit', 'auth', 'multi-tenant'],
        testFn: async () => {
            const cookie = __test__.mintLocationCookie(new Date(), KEY, 'probe-a');
            const parts = cookie.split('.');
            if (parts.length !== 3) return false;
            const [lid, exp, mac] = parts;
            if (lid !== 'probe-a') return false;
            if (!/^\d+$/.test(exp)) return false;
            if (mac.length !== 64) return false;
            // Re-derive the MAC over '<lid>.<exp>' and confirm equality.
            const expected = __test__.sign(`${lid}.${exp}`, KEY);
            return expected === mac;
        },
    },
    {
        name: 'verifyCookieDetailed: new-format cookie returns { ok:true, lid, legacy:false }',
        tags: ['unit', 'auth', 'multi-tenant'],
        testFn: async () => {
            const cookie = __test__.mintLocationCookie(new Date(), KEY, 'loc-a');
            const result = verifyCookieDetailed(cookie, KEY);
            return result.ok && result.lid === 'loc-a' && result.legacy === false;
        },
    },
    {
        name: 'verifyCookieDetailed: legacy-format cookie returns { ok:true, lid:undefined, legacy:true }',
        tags: ['unit', 'auth', 'multi-tenant'],
        testFn: async () => {
            const cookie = __test__.mintCookie(new Date(), KEY);
            const result = verifyCookieDetailed(cookie, KEY);
            return result.ok && result.lid === undefined && result.legacy === true;
        },
    },
    {
        name: 'verifyCookieDetailed: swapping lid on a valid new-format cookie fails verification',
        tags: ['unit', 'auth', 'multi-tenant'],
        testFn: async () => {
            const cookie = __test__.mintLocationCookie(new Date(), KEY, 'loc-a');
            const [, exp, mac] = cookie.split('.');
            const tampered = `loc-b.${exp}.${mac}`;
            return !verifyCookieDetailed(tampered, KEY).ok;
        },
    },
    {
        name: 'verifyCookie (legacy boolean API): still accepts both formats for backward compat',
        tags: ['unit', 'auth', 'multi-tenant'],
        testFn: async () => {
            const legacy = __test__.mintCookie(new Date(), KEY);
            const v2 = __test__.mintLocationCookie(new Date(), KEY, 'loc-a');
            return verifyCookie(legacy, KEY) && verifyCookie(v2, KEY);
        },
    },

    // ---------- Issue #52: requireRole middleware ----------
    {
        name: 'requireRole: new-format cookie with matching lid → calls next(), sets req.hostAuth',
        tags: ['unit', 'auth', 'multi-tenant', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const cookie = __test__.mintLocationCookie(new Date(), KEY, 'probe-a');
                const { res, state } = makeRes();
                const nextState = { called: false };
                const req = {
                    headers: { cookie: `skb_host=${cookie}` },
                    params: { loc: 'probe-a' },
                } as unknown as Request & { hostAuth?: { lid: string; legacy: boolean } };
                requireRole('host')(req, res, () => { nextState.called = true; });
                return nextState.called && state.status === 200
                    && req.hostAuth?.lid === 'probe-a' && req.hostAuth?.legacy === false;
            });
        },
    },
    {
        name: 'requireRole: new-format cookie with MISMATCHED lid → 403 wrong_tenant',
        tags: ['unit', 'auth', 'multi-tenant', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const cookie = __test__.mintLocationCookie(new Date(), KEY, 'probe-a');
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireRole('host')(
                    { headers: { cookie: `skb_host=${cookie}` }, params: { loc: 'probe-b' } } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                const body = state.body as { error?: string } | undefined;
                return state.status === 403 && body?.error === 'wrong_tenant' && !nextState.called;
            });
        },
    },
    {
        name: 'requireRole: legacy cookie → accepts (deprecation window), sets legacy flag',
        tags: ['unit', 'auth', 'multi-tenant', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const cookie = __test__.mintCookie(new Date(), KEY);
                const { res, state } = makeRes();
                const nextState = { called: false };
                const req = {
                    headers: { cookie: `skb_host=${cookie}` },
                    params: { loc: 'probe-a' },
                } as unknown as Request & { hostAuth?: { lid?: string; legacy: boolean } };
                requireRole('host')(req, res, () => { nextState.called = true; });
                return nextState.called && state.status === 200
                    && req.hostAuth?.legacy === true && req.hostAuth?.lid === undefined;
            });
        },
    },
    {
        name: 'requireRole: missing cookie → 401',
        tags: ['unit', 'auth', 'multi-tenant', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireRole('host')(
                    { headers: {}, params: { loc: 'probe-a' } } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                return state.status === 401 && !nextState.called;
            });
        },
    },
    {
        name: 'requireRole: no secret env → 503',
        tags: ['unit', 'auth', 'multi-tenant', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: undefined }, () => {
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireRole('host')(
                    { headers: {}, params: { loc: 'probe-a' } } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                return state.status === 503 && !nextState.called;
            });
        },
    },

    // ---------- Issue #53: skb_session (named-user) cookie ----------
    {
        name: 'mintSessionCookie + verifySessionCookie: round-trips payload exactly',
        tags: ['unit', 'auth', 'session'],
        testFn: async () => {
            const exp = Math.floor(Date.now() / 1000) + 3600;
            const payload: SessionPayload = { uid: 'u1', lid: 'loc-a', role: 'owner', exp };
            const cookie = mintSessionCookie(payload, KEY);
            const v = verifySessionCookie(cookie, KEY);
            return v.ok === true
                && v.payload?.uid === 'u1'
                && v.payload?.lid === 'loc-a'
                && v.payload?.role === 'owner'
                && v.payload?.exp === exp;
        },
    },
    {
        name: 'verifySessionCookie: wrong key → not ok',
        tags: ['unit', 'auth', 'session'],
        testFn: async () => {
            const payload: SessionPayload = { uid: 'u', lid: 'a', role: 'host', exp: Math.floor(Date.now() / 1000) + 3600 };
            const cookie = mintSessionCookie(payload, KEY);
            return !verifySessionCookie(cookie, 'wrong-key').ok;
        },
    },
    {
        name: 'verifySessionCookie: expired → not ok',
        tags: ['unit', 'auth', 'session'],
        testFn: async () => {
            const payload: SessionPayload = { uid: 'u', lid: 'a', role: 'host', exp: Math.floor(Date.now() / 1000) - 10 };
            const cookie = mintSessionCookie(payload, KEY);
            return !verifySessionCookie(cookie, KEY).ok;
        },
    },
    {
        name: 'verifySessionCookie: tampered role (re-signed with wrong key) → not ok',
        tags: ['unit', 'auth', 'session'],
        testFn: async () => {
            const payload: SessionPayload = { uid: 'u', lid: 'a', role: 'host', exp: Math.floor(Date.now() / 1000) + 3600 };
            const cookie = mintSessionCookie(payload, KEY);
            // Forge a new payload saying 'owner' — but keep the original MAC.
            const [ , mac] = cookie.split('.');
            const forgedPayload = Buffer.from(JSON.stringify({ ...payload, role: 'owner' }), 'utf8').toString('base64url');
            return !verifySessionCookie(`${forgedPayload}.${mac}`, KEY).ok;
        },
    },
    {
        name: 'verifySessionCookie: unknown role → not ok',
        tags: ['unit', 'auth', 'session'],
        testFn: async () => {
            // Forge a cookie with a role the app doesn't recognize.
            const raw = Buffer.from(JSON.stringify({ uid: 'u', lid: 'a', role: 'hacker', exp: Math.floor(Date.now() / 1000) + 3600 }), 'utf8').toString('base64url');
            const { createHmac } = await import('node:crypto');
            const mac = createHmac('sha256', KEY).update(raw).digest('hex');
            return !verifySessionCookie(`${raw}.${mac}`, KEY).ok;
        },
    },
    {
        name: 'verifySessionCookie: malformed input → not ok',
        tags: ['unit', 'auth', 'session'],
        testFn: async () => {
            return !verifySessionCookie('', KEY).ok
                && !verifySessionCookie('nodot', KEY).ok
                && !verifySessionCookie('.short', KEY).ok
                && !verifySessionCookie('abc.def', KEY).ok; // mac not 64 hex chars
        },
    },

    // ---------- Issue #53: requireRole with session cookie ----------
    // Note: since issue #55, requireRole does a live membership check in
    // Mongo for session cookies (R4: revoked memberships fail at next
    // request). Two paths are possible:
    //   (a) Mongo reachable + membership active: next() is called.
    //   (b) Mongo reachable + no membership: 401 unauthorized.
    //   (c) Mongo unreachable: 503 temporarily unavailable.
    // The pure-cookie-parse assertions (tenant mismatch, role mismatch,
    // expired/bad HMAC) still short-circuit synchronously — those unit
    // tests work unchanged. The "happy path" test below moved to the
    // integration suite (see tests/integration/invites.integration.test.ts).
    {
        name: 'requireRole: session cookie with matching lid → either next() (live membership) or DB failure path',
        tags: ['unit', 'auth', 'session', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY, MONGODB_URI: 'mongodb://127.0.0.1:1/skb_nonexistent' }, async () => {
                const exp = Math.floor(Date.now() / 1000) + 3600;
                // Use a hex uid so the ObjectId parse succeeds and we reach the DB step.
                const payload: SessionPayload = { uid: '000000000000000000000001', lid: 'loc-a', role: 'owner', exp };
                const cookie = mintSessionCookie(payload, KEY);
                const { res, state } = makeRes();
                const nextState = { called: false };
                const req = {
                    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
                    params: { loc: 'loc-a' },
                } as unknown as Request & { hostAuth?: { uid?: string; role: string; source: string } };
                await requireRole('owner', 'admin')(req, res, () => { nextState.called = true; });
                // Against a mongodb URI that can't connect: status is 503 OR 401 depending on timing.
                // We only assert that the pre-DB parsing succeeded (role/lid matched) by checking
                // we did NOT get a 403 wrong_tenant or 403 forbidden.
                return state.status !== 403;
            });
        },
    },
    {
        name: 'requireRole: session cookie with mismatched lid → 403 wrong_tenant',
        tags: ['unit', 'auth', 'session', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const payload: SessionPayload = { uid: 'u', lid: 'loc-a', role: 'owner', exp: Math.floor(Date.now() / 1000) + 3600 };
                const cookie = mintSessionCookie(payload, KEY);
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireRole('owner')(
                    { headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, params: { loc: 'loc-b' } } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                const body = state.body as { error?: string } | undefined;
                return state.status === 403 && body?.error === 'wrong_tenant' && !nextState.called;
            });
        },
    },
    {
        name: 'requireRole: session cookie with role not in allowed set → 403 forbidden',
        tags: ['unit', 'auth', 'session', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const payload: SessionPayload = { uid: 'u', lid: 'loc-a', role: 'host', exp: Math.floor(Date.now() / 1000) + 3600 };
                const cookie = mintSessionCookie(payload, KEY);
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireRole('owner', 'admin')(
                    { headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, params: { loc: 'loc-a' } } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                const body = state.body as { error?: string } | undefined;
                return state.status === 403 && body?.error === 'forbidden' && !nextState.called;
            });
        },
    },
    {
        name: 'requireRole: host-PIN cookie rejected when only "owner" role allowed',
        tags: ['unit', 'auth', 'session', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const cookie = __test__.mintLocationCookie(new Date(), KEY, 'loc-a');
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireRole('owner')(
                    { headers: { cookie: `skb_host=${cookie}` }, params: { loc: 'loc-a' } } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                const body = state.body as { error?: string } | undefined;
                return state.status === 403 && body?.error === 'forbidden' && !nextState.called;
            });
        },
    },
    {
        name: 'requireRole: session cookie takes precedence over host cookie when both present',
        tags: ['unit', 'auth', 'session', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, async () => {
                const session = mintSessionCookie({ uid: '000000000000000000000001', lid: 'loc-a', role: 'owner', exp: Math.floor(Date.now() / 1000) + 3600 }, KEY);
                const host = __test__.mintLocationCookie(new Date(), KEY, 'loc-a');
                const { res, state } = makeRes();
                const nextState = { called: false };
                const req = {
                    headers: { cookie: `${SESSION_COOKIE_NAME}=${session}; skb_host=${host}` },
                    params: { loc: 'loc-a' },
                } as unknown as Request & { hostAuth?: { source?: string; role?: string } };
                // requireRole is async since #55 — the DB-backed
                // membership check means next() only resolves after
                // Mongo replies. We just verify that the session-cookie
                // branch is taken (status is 401/503/pass, NOT 403
                // wrong_tenant or forbidden which would indicate the
                // host-cookie fallback fired).
                await requireRole('owner')(req, res, () => { nextState.called = true; });
                return state.status !== 403;
            });
        },
    },
    {
        name: 'requireRole: invalid session cookie → 401 (does not fall through to host cookie)',
        tags: ['unit', 'auth', 'session', 'requireRole'],
        testFn: async () => {
            return withEnv({ SKB_COOKIE_SECRET: KEY }, () => {
                const host = __test__.mintLocationCookie(new Date(), KEY, 'loc-a');
                const { res, state } = makeRes();
                const nextState = { called: false };
                requireRole('host')(
                    { headers: { cookie: `${SESSION_COOKIE_NAME}=garbage.deadbeef; skb_host=${host}` }, params: { loc: 'loc-a' } } as unknown as Request,
                    res,
                    () => { nextState.called = true; },
                );
                return state.status === 401 && !nextState.called;
            });
        },
    },
];

void runTests(cases, 'host auth (cookie)');
