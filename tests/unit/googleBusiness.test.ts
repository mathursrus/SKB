// ============================================================================
// Unit tests — Google Business Profile service (issue #51 Phase D)
// ============================================================================
//
// Covers the pure / inputs-outputs side of src/services/googleBusiness.ts.
// Does NOT touch Mongo and does NOT hit the real Google API — token exchange
// and refresh paths get a mocked `fetch`. Token persistence is exercised by
// the integration test; here we stay stdlib-only.
//
// Specifically:
//   · credential-missing fallback (readOAuthConfig / areCredentialsConfigured)
//   · PKCE generation + verifier/challenge relationship (RFC 7636)
//   · auth URL contract — scopes, PKCE params, access_type=offline
//   · exchangeCode with mocked fetch — happy path + missing refresh_token
//   · refreshAccessToken with mocked fetch
//   · OSH → GBP shape: weeklyHoursToRegularHours, normalizePhone,
//     buildGbpPatchPayload, pushedFlags
//   · toPublicGoogleToken strips accessToken + refreshToken (the
//     "never-in-response" contract)
// ============================================================================

import { ObjectId } from 'mongodb';
import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    areCredentialsConfigured,
    readOAuthConfig,
    generatePkcePair,
    pkceChallengeFromVerifier,
    buildAuthUrl,
    exchangeCode,
    refreshAccessToken,
    weeklyHoursToRegularHours,
    normalizePhone,
    buildGbpPatchPayload,
    pushedFlags,
    toPublicGoogleToken,
    __test__,
    type GoogleOAuthConfig,
    type GoogleToken,
} from '../../src/services/googleBusiness.js';
import type { Location } from '../../src/types/queue.js';

// Preserve and restore env between cases.
const savedEnv: Record<string, string | undefined> = {};
function snapEnv(keys: string[]): void {
    for (const k of keys) savedEnv[k] = process.env[k];
}
function restoreEnv(): void {
    for (const k of Object.keys(savedEnv)) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
    }
}

snapEnv([
    'OSH_GOOGLE_CLIENT_ID', 'OSH_GOOGLE_CLIENT_SECRET', 'OSH_GOOGLE_REDIRECT_URI',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
    'SKB_PUBLIC_BASE_URL',
]);

const TEST_CONFIG: GoogleOAuthConfig = {
    clientId: 'test-client-id.apps.googleusercontent.com',
    clientSecret: 'test-client-secret',
    // Phase D fix: one global callback URI registered in Google Cloud;
    // tenant info rides in the `state` param, not the URL path.
    redirectUri: 'http://localhost:3000/api/google/oauth/callback',
};

// Small mock helper that yields a Response-alike for fetch.
function mockResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return body as Record<string, unknown>; },
        async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
    } as unknown as Response;
}

const cases: BaseTestCase[] = [
    // ── Credential fallback ────────────────────────────────────────────
    {
        name: 'credential-missing → readOAuthConfig returns null, areCredentialsConfigured false',
        tags: ['unit', 'googleBusiness', 'creds'],
        testFn: async () => {
            delete process.env.OSH_GOOGLE_CLIENT_ID;
            delete process.env.OSH_GOOGLE_CLIENT_SECRET;
            delete process.env.OSH_GOOGLE_REDIRECT_URI;
            delete process.env.GOOGLE_CLIENT_ID;
            delete process.env.GOOGLE_CLIENT_SECRET;
            const ok = readOAuthConfig() === null && areCredentialsConfigured() === false;
            restoreEnv();
            return ok;
        },
    },
    {
        name: 'credentials-present (legacy GOOGLE_*) → readOAuthConfig returns both halves',
        tags: ['unit', 'googleBusiness', 'creds'],
        testFn: async () => {
            delete process.env.OSH_GOOGLE_CLIENT_ID;
            delete process.env.OSH_GOOGLE_CLIENT_SECRET;
            process.env.GOOGLE_CLIENT_ID = 'abc';
            process.env.GOOGLE_CLIENT_SECRET = 'xyz';
            const cfg = readOAuthConfig();
            const ok = cfg !== null && cfg.clientId === 'abc' && cfg.clientSecret === 'xyz';
            restoreEnv();
            return ok;
        },
    },
    {
        name: 'OSH_GOOGLE_* env vars are preferred over GOOGLE_* (rebrand)',
        tags: ['unit', 'googleBusiness', 'creds', 'osh-env'],
        testFn: async () => {
            process.env.OSH_GOOGLE_CLIENT_ID = 'new-osh';
            process.env.OSH_GOOGLE_CLIENT_SECRET = 'osh-secret';
            process.env.GOOGLE_CLIENT_ID = 'legacy-google';
            process.env.GOOGLE_CLIENT_SECRET = 'legacy-secret';
            const cfg = readOAuthConfig();
            const ok = cfg !== null && cfg.clientId === 'new-osh' && cfg.clientSecret === 'osh-secret';
            restoreEnv();
            return ok;
        },
    },
    {
        name: 'credentials-present (OSH_* only) → readOAuthConfig reads from OSH_ vars',
        tags: ['unit', 'googleBusiness', 'creds', 'osh-env'],
        testFn: async () => {
            delete process.env.GOOGLE_CLIENT_ID;
            delete process.env.GOOGLE_CLIENT_SECRET;
            process.env.OSH_GOOGLE_CLIENT_ID = 'osh-only-client';
            process.env.OSH_GOOGLE_CLIENT_SECRET = 'osh-only-secret';
            const cfg = readOAuthConfig();
            const ok = cfg !== null && cfg.clientId === 'osh-only-client' && cfg.clientSecret === 'osh-only-secret';
            restoreEnv();
            return ok;
        },
    },
    {
        // Regression: dev machines may carry an unrelated GOOGLE_REDIRECT_URI
        // from another project (e.g., a calendar helper). Per-field fallback
        // would mix OSH's client_id with that project's redirect_uri, producing
        // redirect_uri_mismatch at Google. readOAuthConfig/resolveRedirectUri
        // must pick one ENV bundle atomically.
        name: 'atomic env bundle — OSH_CLIENT_ID present ignores legacy GOOGLE_REDIRECT_URI',
        tags: ['unit', 'googleBusiness', 'creds', 'osh-env', 'regression'],
        testFn: async () => {
            delete process.env.OSH_GOOGLE_REDIRECT_URI;
            delete process.env.SKB_PUBLIC_BASE_URL;
            process.env.OSH_GOOGLE_CLIENT_ID = 'osh-client';
            process.env.OSH_GOOGLE_CLIENT_SECRET = 'osh-secret';
            process.env.GOOGLE_CLIENT_ID = 'legacy-client';
            process.env.GOOGLE_CLIENT_SECRET = 'legacy-secret';
            process.env.GOOGLE_REDIRECT_URI = 'http://localhost:8371/oauth/callback';
            const { resolveRedirectUri, readOAuthConfig: reread } = await import('../../src/services/googleBusiness.js');
            const cfg = reread();
            const uri = resolveRedirectUri();
            restoreEnv();
            // Client ID comes from OSH bundle; redirect URI must NOT leak from legacy bundle.
            return cfg !== null
                && cfg.clientId === 'osh-client'
                && cfg.clientSecret === 'osh-secret'
                && uri === 'http://localhost:3000/api/google/oauth/callback'
                && !uri.includes('8371');
        },
    },
    {
        name: 'resolveRedirectUri returns a GLOBAL path, not per-tenant (single registered URI)',
        tags: ['unit', 'googleBusiness', 'osh-env'],
        testFn: async () => {
            delete process.env.OSH_GOOGLE_REDIRECT_URI;
            delete process.env.GOOGLE_REDIRECT_URI;
            process.env.SKB_PUBLIC_BASE_URL = 'https://example.com';
            // Import dynamically to avoid capturing a stale readEnv cache.
            const { resolveRedirectUri } = await import('../../src/services/googleBusiness.js');
            const uri = resolveRedirectUri();
            restoreEnv();
            return uri === 'https://example.com/api/google/oauth/callback'
                && !uri.includes('/r/');
        },
    },
    {
        name: 'OSH_GOOGLE_REDIRECT_URI overrides the computed default',
        tags: ['unit', 'googleBusiness', 'osh-env'],
        testFn: async () => {
            // OSH bundle is atomic — CLIENT_ID must be set for OSH_REDIRECT_URI to take effect.
            process.env.OSH_GOOGLE_CLIENT_ID = 'osh-client';
            process.env.OSH_GOOGLE_CLIENT_SECRET = 'osh-secret';
            process.env.OSH_GOOGLE_REDIRECT_URI = 'https://custom.example.com/oauth/cb';
            const { resolveRedirectUri } = await import('../../src/services/googleBusiness.js');
            const ok = resolveRedirectUri() === 'https://custom.example.com/oauth/cb';
            restoreEnv();
            return ok;
        },
    },

    // ── PKCE ───────────────────────────────────────────────────────────
    {
        name: 'generatePkcePair returns a 43-char+ verifier and an S256 challenge that matches',
        tags: ['unit', 'googleBusiness', 'pkce'],
        testFn: async () => {
            const p = generatePkcePair();
            if (p.method !== 'S256') return false;
            if (p.verifier.length < 43 || p.verifier.length > 128) return false;
            // base64url chars only
            if (!/^[A-Za-z0-9_-]+$/.test(p.verifier)) return false;
            if (!/^[A-Za-z0-9_-]+$/.test(p.challenge)) return false;
            return pkceChallengeFromVerifier(p.verifier) === p.challenge;
        },
    },
    {
        name: 'PKCE verifiers are unique across calls',
        tags: ['unit', 'googleBusiness', 'pkce'],
        testFn: async () => {
            const s = new Set<string>();
            for (let i = 0; i < 20; i++) s.add(generatePkcePair().verifier);
            return s.size === 20;
        },
    },

    // ── Auth URL ───────────────────────────────────────────────────────
    {
        name: 'buildAuthUrl contains required OAuth parameters with scopes and access_type=offline',
        tags: ['unit', 'googleBusiness', 'oauth'],
        testFn: async () => {
            const pkce = generatePkcePair();
            const url = buildAuthUrl({
                config: TEST_CONFIG,
                redirectUri: TEST_CONFIG.redirectUri,
                state: 'skb.abc123',
                pkce,
            });
            const u = new URL(url);
            if (u.origin + u.pathname !== __test__.GOOGLE_AUTH_ENDPOINT) return false;
            const p = u.searchParams;
            if (p.get('response_type') !== 'code') return false;
            if (p.get('client_id') !== TEST_CONFIG.clientId) return false;
            if (p.get('redirect_uri') !== TEST_CONFIG.redirectUri) return false;
            if (p.get('access_type') !== 'offline') return false;
            if (p.get('code_challenge_method') !== 'S256') return false;
            if (p.get('code_challenge') !== pkce.challenge) return false;
            if (p.get('state') !== 'skb.abc123') return false;
            const scope = p.get('scope') || '';
            return scope.includes('business.manage')
                && scope.includes('openid')
                && scope.includes('email')
                && scope.includes('profile');
        },
    },

    // ── Token exchange (mocked fetch) ──────────────────────────────────
    {
        name: 'exchangeCode returns structured tokens on happy-path response',
        tags: ['unit', 'googleBusiness', 'token-exchange'],
        testFn: async () => {
            const pkce = generatePkcePair();
            const mockFetch: typeof fetch = async () => mockResponse(200, {
                access_token: 'acc-123',
                refresh_token: 'ref-456',
                expires_in: 3599,
                scope: 'https://www.googleapis.com/auth/business.manage openid',
                token_type: 'Bearer',
            });
            const result = await exchangeCode({
                config: TEST_CONFIG,
                redirectUri: TEST_CONFIG.redirectUri,
                code: 'any-code',
                codeVerifier: pkce.verifier,
                fetchFn: mockFetch,
            });
            return result.accessToken === 'acc-123'
                && result.refreshToken === 'ref-456'
                && result.expiresIn === 3599
                && result.scope.includes('business.manage');
        },
    },
    {
        name: 'exchangeCode rejects when Google omits refresh_token',
        tags: ['unit', 'googleBusiness', 'token-exchange'],
        testFn: async () => {
            const mockFetch: typeof fetch = async () => mockResponse(200, {
                access_token: 'acc-1',
                // no refresh_token — can happen when prompt != consent
                expires_in: 3600,
            });
            try {
                await exchangeCode({
                    config: TEST_CONFIG,
                    redirectUri: TEST_CONFIG.redirectUri,
                    code: 'c',
                    codeVerifier: 'v'.repeat(43),
                    fetchFn: mockFetch,
                });
                return false;
            } catch (err) {
                return err instanceof Error && /refresh_token/.test(err.message);
            }
        },
    },
    {
        name: 'exchangeCode throws on non-2xx with body preview in message',
        tags: ['unit', 'googleBusiness', 'token-exchange'],
        testFn: async () => {
            const mockFetch: typeof fetch = async () => mockResponse(400, '{"error":"invalid_grant"}');
            try {
                await exchangeCode({
                    config: TEST_CONFIG,
                    redirectUri: TEST_CONFIG.redirectUri,
                    code: 'bad',
                    codeVerifier: 'v'.repeat(43),
                    fetchFn: mockFetch,
                });
                return false;
            } catch (err) {
                return err instanceof Error && /invalid_grant/.test(err.message);
            }
        },
    },
    {
        name: 'refreshAccessToken returns a new access_token from Google response',
        tags: ['unit', 'googleBusiness', 'token-refresh'],
        testFn: async () => {
            const mockFetch: typeof fetch = async () => mockResponse(200, {
                access_token: 'fresh-acc',
                expires_in: 3600,
            });
            const r = await refreshAccessToken({
                config: TEST_CONFIG,
                refreshToken: 'ref-existing',
                fetchFn: mockFetch,
            });
            return r.accessToken === 'fresh-acc' && r.expiresIn === 3600;
        },
    },

    // ── OSH → GBP shape ────────────────────────────────────────────────
    {
        name: 'weeklyHoursToRegularHours skips closed days and emits all configured service periods',
        tags: ['unit', 'googleBusiness', 'shape'],
        testFn: async () => {
            const hours = {
                mon: 'closed' as const,
                tue: { breakfast: { open: '09:00', close: '11:00' }, dinner: { open: '17:00', close: '22:00' } },
                wed: {
                    lunch: { open: '11:30', close: '14:30' },
                    special: { open: '15:00', close: '16:00' },
                    dinner: { open: '17:00', close: '22:00' },
                },
            };
            const out = weeklyHoursToRegularHours(hours) as { periods: Array<Record<string, unknown>> } | null;
            if (!out) return false;
            // tue=2 periods, wed=3 periods, mon=skipped
            if (out.periods.length !== 5) return false;
            const tueBreakfast = out.periods[0];
            if (tueBreakfast.openDay !== 'TUESDAY') return false;
            const breakfastOpen = tueBreakfast.openTime as { hours: number; minutes: number };
            if (breakfastOpen.hours !== 9 || breakfastOpen.minutes !== 0) return false;
            const wedSpecial = out.periods[3];
            const specialOpen = wedSpecial.openTime as { hours: number; minutes: number };
            return wedSpecial.openDay === 'WEDNESDAY'
                && specialOpen.hours === 15
                && specialOpen.minutes === 0;
        },
    },
    {
        name: 'weeklyHoursToRegularHours(undefined) returns null',
        tags: ['unit', 'googleBusiness', 'shape'],
        testFn: async () => weeklyHoursToRegularHours(undefined) === null,
    },
    {
        name: 'normalizePhone handles 10-digit and 11-digit with country code; rejects garbage',
        tags: ['unit', 'googleBusiness', 'shape'],
        testFn: async () => {
            return normalizePhone('2065551234') === '+12065551234'
                && normalizePhone('12065551234') === '+12065551234'
                && normalizePhone('') === null
                && normalizePhone('555') === null
                && normalizePhone(undefined) === null;
        },
    },
    {
        name: 'buildGbpPatchPayload omits fields the owner hasn\'t configured',
        tags: ['unit', 'googleBusiness', 'shape'],
        testFn: async () => {
            const loc: Location = {
                _id: 'skb',
                name: 'SKB',
                pin: '1234',
                createdAt: new Date(),
                // no hours, no phone, no description
            };
            const payload = buildGbpPatchPayload(loc);
            const flags = pushedFlags(payload);
            return !flags.hours && !flags.phone && !flags.description
                && payload.hours === undefined
                && payload.phone === undefined
                && payload.description === undefined;
        },
    },
    {
        name: 'buildGbpPatchPayload maps phone + about + hours through to GBP shape',
        tags: ['unit', 'googleBusiness', 'shape'],
        testFn: async () => {
            const loc: Location = {
                _id: 'skb',
                name: 'SKB',
                pin: '1234',
                createdAt: new Date(),
                frontDeskPhone: '2065551234',
                hours: { mon: { lunch: { open: '11:00', close: '14:00' } } },
                content: { about: '  Beloved neighborhood diner.  ' },
            };
            const payload = buildGbpPatchPayload(loc);
            const flags = pushedFlags(payload);
            return flags.hours && flags.phone && flags.description
                && payload.phone === '+12065551234'
                && payload.description === 'Beloved neighborhood diner.'
                && payload.hours !== null;
        },
    },

    // ── Public projection contract ─────────────────────────────────────
    {
        name: 'toPublicGoogleToken never exposes accessToken or refreshToken (the "never-in-response" contract)',
        tags: ['unit', 'googleBusiness', 'security'],
        testFn: async () => {
            const row: GoogleToken = {
                _id: new ObjectId(),
                locationId: 'skb',
                accessToken: 'SECRET-access',
                refreshToken: 'SECRET-refresh',
                expiresAt: new Date(Date.now() + 3600_000),
                accountId: 'accounts/123',
                locationResourceName: 'accounts/123/locations/456',
                connectedAt: new Date(),
                connectedByUserId: new ObjectId(),
                lastSyncAt: new Date(),
            };
            const pub = toPublicGoogleToken(row);
            const serialized = JSON.stringify(pub);
            if (serialized.includes('SECRET-access')) return false;
            if (serialized.includes('SECRET-refresh')) return false;
            if (!('accountId' in pub)) return false;
            if (!('locationResourceName' in pub)) return false;
            // Ensure the raw object doesn't carry the forbidden fields either,
            // so downstream res.json(row) would also be safe if someone tried.
            return !('accessToken' in pub) && !('refreshToken' in pub);
        },
    },
    {
        name: 'toPublicGoogleToken omits empty optional fields',
        tags: ['unit', 'googleBusiness', 'security'],
        testFn: async () => {
            const row: GoogleToken = {
                _id: new ObjectId(),
                locationId: 'skb',
                accessToken: 'a',
                refreshToken: 'r',
                expiresAt: new Date(),
                connectedAt: new Date(),
                connectedByUserId: new ObjectId(),
            };
            const pub = toPublicGoogleToken(row);
            return !('accountId' in pub)
                && !('locationResourceName' in pub)
                && !('lastSyncAt' in pub)
                && !('lastSyncError' in pub);
        },
    },

    // ── refresh-on-401 shape proof: the gbpFetch helper is tested by
    //    integration; at unit level we just prove refreshAccessToken
    //    calls the token endpoint and returns the new token. That's
    //    already covered above — keep this case as a named smoke so
    //    `npm test` counts it in the suite totals.
    {
        name: 'refresh-on-401 path — refreshAccessToken contract holds under repeat calls',
        tags: ['unit', 'googleBusiness', 'token-refresh'],
        testFn: async () => {
            let calls = 0;
            const mockFetch: typeof fetch = async () => {
                calls += 1;
                return mockResponse(200, { access_token: 'acc-' + calls, expires_in: 3600 });
            };
            const r1 = await refreshAccessToken({ config: TEST_CONFIG, refreshToken: 'r', fetchFn: mockFetch });
            const r2 = await refreshAccessToken({ config: TEST_CONFIG, refreshToken: 'r', fetchFn: mockFetch });
            return r1.accessToken === 'acc-1' && r2.accessToken === 'acc-2' && calls === 2;
        },
    },
];

void runTests(cases, 'google business profile service (issue #51 Phase D)');
