// ============================================================================
// SKB - Google Business Profile routes (issue #51 Phase D)
// ============================================================================
//
// All endpoints mount under /r/:loc/api/google/*. Every handler except the
// OAuth callback is requireRole('owner', 'admin') — matching the rest of the
// admin surface. The callback is public but consumes a short-lived PKCE
// verifier cookie scoped to /r/:loc/api/google/oauth/ plus a state value that
// encodes the locationId; a request with a stale / wrong-tenant cookie cannot
// write a token row for a different location.
//
// Credential-missing fallback: if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are
// unset, /status still 200s with connected=false + `credsConfigured: false`
// so the admin card can render a helpful message. /oauth/start / /sync / etc.
// return 503 with a clear error so the UI can show the toast.
//
// ============================================================================

import { Router, type Request, type Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';

import { requireRole } from '../middleware/hostAuth.js';
import {
    readOAuthConfig,
    areCredentialsConfigured,
    resolveRedirectUri,
    generatePkcePair,
    buildAuthUrl,
    exchangeCode,
    revokeRefreshToken,
    upsertToken,
    getTokenFor,
    deleteTokenFor,
    setLinkedLocation,
    toPublicGoogleToken,
    listGbpAccounts,
    listGbpLocationsForAccount,
    pushToGbp,
    type GoogleOAuthConfig,
} from '../services/googleBusiness.js';

const PKCE_COOKIE = 'skb_google_oauth';
const PKCE_COOKIE_MAX_AGE_SECONDS = 10 * 60; // 10 minutes — OAuth round-trip

function loc(req: Request): string {
    return String(req.params.loc ?? '');
}

function readNamedCookie(header: string | undefined, name: string): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const k = part.slice(0, eq).trim();
        if (k === name) return part.slice(eq + 1).trim();
    }
    return null;
}

/**
 * Serialize the PKCE cookie as `<verifier>.<sha256(state)>` so the callback
 * can verify it came back with the state it started with. Scope the cookie
 * to /r/:loc/api/google/oauth/ so it's never sent with other requests.
 */
function mintPkceCookie(verifier: string, state: string): string {
    const stateHash = createHash('sha256').update(state).digest('hex');
    return `${verifier}.${stateHash}`;
}

function parsePkceCookie(raw: string): { verifier: string; stateHash: string } | null {
    const idx = raw.indexOf('.');
    if (idx <= 0) return null;
    return { verifier: raw.slice(0, idx), stateHash: raw.slice(idx + 1) };
}

export function googleRouter(): Router {
    const r = Router({ mergeParams: true });
    const ownerOrAdmin = requireRole('owner', 'admin');

    // ─── GET /google/status ───────────────────────────────────────────────
    r.get('/google/status', ownerOrAdmin, async (req: Request, res: Response) => {
        const credsConfigured = areCredentialsConfigured();
        try {
            const row = await getTokenFor(loc(req));
            if (!row) {
                res.json({ connected: false, credsConfigured });
                return;
            }
            const pub = toPublicGoogleToken(row);
            res.json({
                connected: true,
                credsConfigured,
                accountId: pub.accountId,
                locationResourceName: pub.locationResourceName,
                lastSyncAt: pub.lastSyncAt,
                lastSyncError: pub.lastSyncError,
                connectedAt: pub.connectedAt,
            });
        } catch (err) {
            console.error('[google] status error:', err);
            res.status(503).json({ error: 'service unavailable' });
        }
    });

    // ─── POST /google/oauth/start ─────────────────────────────────────────
    // Returns { authUrl } and sets the PKCE verifier cookie. The admin JS
    // then redirects the window to authUrl.
    //
    // The PKCE cookie's Path is the GLOBAL callback path (/api/google/oauth/)
    // so the browser will send it on the final callback hit, which no longer
    // lives under /r/:loc/ — see the global callback router mounted in
    // src/mcp-server.ts.
    r.post('/google/oauth/start', ownerOrAdmin, async (req: Request, res: Response) => {
        const config = readOAuthConfig();
        if (!config) {
            res.status(503).json({ error: 'google credentials not configured on this server' });
            return;
        }
        const locationId = loc(req);
        const pkce = generatePkcePair();
        // The state carries the locationId so the callback knows which tenant
        // it's completing for. A 16-byte nonce binds state to this request so
        // a captured state can't be replayed across sessions.
        const nonce = randomBytes(16).toString('base64url');
        const state = `${locationId}.${nonce}`;
        const redirectUri = resolveRedirectUri();
        const authUrl = buildAuthUrl({
            config,
            redirectUri,
            state,
            pkce,
        });
        const cookie = mintPkceCookie(pkce.verifier, state);
        res.setHeader(
            'Set-Cookie',
            `${PKCE_COOKIE}=${cookie}; Path=/api/google/oauth/; HttpOnly; SameSite=Lax; Max-Age=${PKCE_COOKIE_MAX_AGE_SECONDS}`,
        );
        res.json({ authUrl });
    });

    // The OAuth callback lives in its own global router below (googleOauthCallbackRouter)
    // because Google Cloud requires ONE exact registered redirect URI per OAuth
    // client — a per-tenant path would force a new registration for every
    // restaurant. Tenant info is carried in the `state` param, parsed by the
    // global handler. See src/mcp-server.ts for the mount.

    // ─── POST /google/disconnect ──────────────────────────────────────────
    r.post('/google/disconnect', ownerOrAdmin, async (req: Request, res: Response) => {
        try {
            const row = await getTokenFor(loc(req));
            if (!row) {
                res.json({ ok: true, wasConnected: false });
                return;
            }
            // Revoke via Google, then drop the row. Revoke failures are
            // logged-but-swallowed: the local row is the source of truth,
            // and leaving it in place would keep the UI showing "connected"
            // even though the owner asked to disconnect.
            try {
                await revokeRefreshToken(row.refreshToken);
            } catch (err) {
                console.warn('[google] revoke failed (continuing):', err);
            }
            await deleteTokenFor(loc(req));
            res.json({ ok: true, wasConnected: true });
        } catch (err) {
            console.error('[google] disconnect error:', err);
            res.status(503).json({ error: 'service unavailable' });
        }
    });

    // ─── GET /google/locations ────────────────────────────────────────────
    // List the GBP locations available on the connected account — used to
    // populate the multi-location picker.
    r.get('/google/locations', ownerOrAdmin, async (req: Request, res: Response) => {
        try {
            const token = await getTokenFor(loc(req));
            if (!token) {
                res.status(400).json({ error: 'not connected' });
                return;
            }
            const accounts = await listGbpAccounts(loc(req));
            if (accounts.length === 0) {
                res.json({ accounts: [], locations: [] });
                return;
            }
            // v1: first account only. Multi-account owners are rare enough
            // we punt the account picker to a follow-up.
            const acc = accounts[0];
            const locs = await listGbpLocationsForAccount(loc(req), acc.name);
            res.json({ accounts: [acc], locations: locs });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(502).json({ error: `gbp api error: ${msg}` });
        }
    });

    // ─── POST /google/link ────────────────────────────────────────────────
    r.post('/google/link', ownerOrAdmin, async (req: Request, res: Response) => {
        const body = (req.body ?? {}) as { locationResourceName?: unknown };
        const rn = typeof body.locationResourceName === 'string' ? body.locationResourceName : '';
        if (!rn || !rn.startsWith('locations/') && !rn.includes('/locations/')) {
            res.status(400).json({ error: 'locationResourceName must look like "accounts/.../locations/..." or "locations/..."' });
            return;
        }
        try {
            const token = await getTokenFor(loc(req));
            if (!token) {
                res.status(400).json({ error: 'not connected' });
                return;
            }
            await setLinkedLocation(loc(req), rn);
            res.json({ ok: true, locationResourceName: rn });
        } catch (err) {
            console.error('[google] link error:', err);
            res.status(503).json({ error: 'service unavailable' });
        }
    });

    // ─── POST /google/sync ────────────────────────────────────────────────
    r.post('/google/sync', ownerOrAdmin, async (req: Request, res: Response) => {
        if (!areCredentialsConfigured()) {
            res.status(503).json({ error: 'google credentials not configured on this server' });
            return;
        }
        try {
            const result = await pushToGbp(loc(req));
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: result.ok ? 'info' : 'warn',
                msg: result.ok ? 'gbp.sync.ok' : 'gbp.sync.fail',
                loc: loc(req),
                pushed: result.pushed,
                gbp: result.gbpLocationResourceName,
                err: result.error,
            }));
            if (!result.ok) {
                res.status(502).json({
                    ok: false,
                    error: result.error ?? 'sync failed',
                    pushed: result.pushed,
                });
                return;
            }
            res.json({
                ok: true,
                gbpLocationResourceName: result.gbpLocationResourceName,
                pushed: result.pushed,
            });
        } catch (err) {
            console.error('[google] sync error:', err);
            res.status(503).json({ error: 'service unavailable' });
        }
    });

    return r;
}

/**
 * The GLOBAL OAuth callback router. Mounted at `/api` (NOT under `/r/:loc/`)
 * so Google Cloud registers ONE redirect URI per OAuth client, not one per
 * tenant. Tenant info is read from the `state` query param, which is bound
 * to the PKCE cookie by `sha256(state)` so an attacker can't forge it.
 *
 * Correctness depends on:
 *   (1) `state` has shape `<locationId>.<nonce>` — the locationId tells us
 *       which tenant admin to redirect back to.
 *   (2) The PKCE cookie's stateHash matches sha256(state) — proves the
 *       callback completion is bound to the same /oauth/start request.
 *   (3) Google itself enforces that code_verifier matches the challenge it
 *       stored at /authorize time.
 */
export function googleOauthCallbackRouter(): Router {
    const r = Router();
    r.get('/google/oauth/callback', async (req: Request, res: Response) => {
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        const errorParam = typeof req.query.error === 'string' ? req.query.error : '';

        // Parse `<locationId>.<nonce>` up front — we need it even for the
        // error redirects so the user lands back on their own admin page.
        // If state is missing or malformed, we fall back to the platform
        // marketing landing (naked `/`) with a query param.
        const dot = state.indexOf('.');
        const locationId = dot > 0 ? state.slice(0, dot) : '';
        const errRedirect = (code: string) => {
            if (locationId && /^[a-z0-9-]{1,60}$/.test(locationId)) {
                return `/r/${locationId}/admin.html?tab=settings&google=error=${encodeURIComponent(code)}`;
            }
            return `/?google=error=${encodeURIComponent(code)}`;
        };

        if (errorParam) { res.redirect(302, errRedirect(errorParam)); return; }
        if (!code || !state) { res.redirect(302, errRedirect('missing_code')); return; }
        if (!locationId || !/^[a-z0-9-]{1,60}$/.test(locationId)) {
            res.redirect(302, errRedirect('bad_state'));
            return;
        }

        const raw = readNamedCookie(req.headers.cookie, PKCE_COOKIE);
        if (!raw) { res.redirect(302, errRedirect('missing_pkce')); return; }
        const parsed = parsePkceCookie(raw);
        if (!parsed) { res.redirect(302, errRedirect('bad_pkce')); return; }
        const expected = createHash('sha256').update(state).digest('hex');
        if (parsed.stateHash !== expected) { res.redirect(302, errRedirect('state_mismatch')); return; }

        const config = readOAuthConfig();
        if (!config) { res.redirect(302, errRedirect('creds_missing')); return; }

        const connectedByUserId = await resolveConnectedByUserId(req);
        try {
            const redirectUri = resolveRedirectUri();
            const tokens = await exchangeCode({
                config,
                redirectUri,
                code,
                codeVerifier: parsed.verifier,
            });
            await upsertToken({
                locationId,
                connectedByUserId,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
            });
            // Best-effort single-location auto-link.
            try {
                const accounts = await listGbpAccounts(locationId);
                if (accounts.length === 1) {
                    const locs = await listGbpLocationsForAccount(locationId, accounts[0].name);
                    if (locs.length === 1) {
                        await setLinkedLocation(locationId, locs[0].name);
                    }
                }
            } catch { /* picker path handles multi-location */ }

            // Clear the PKCE cookie (global path).
            res.setHeader(
                'Set-Cookie',
                `${PKCE_COOKIE}=; Path=/api/google/oauth/; HttpOnly; SameSite=Lax; Max-Age=0`,
            );
            res.redirect(302, `/r/${locationId}/admin.html?tab=settings&google=connected`);
        } catch (err) {
            console.error('[google] oauth callback exchange error:', err);
            res.redirect(302, errRedirect('exchange_failed'));
        }
    });
    return r;
}

/**
 * The callback doesn't pass through requireRole (it's a public GET redirect
 * target), but we still want to attribute the token row to a real user for
 * audit. Best-effort: decode the session cookie; fall back to a synthetic
 * ObjectId(0) if the user hit the callback without an active session.
 */
async function resolveConnectedByUserId(req: Request): Promise<ObjectId> {
    const raw = readNamedCookie(req.headers.cookie, 'skb_session');
    if (!raw) return new ObjectId(0);
    const dot = raw.lastIndexOf('.');
    if (dot <= 0) return new ObjectId(0);
    try {
        const payload = JSON.parse(Buffer.from(raw.slice(0, dot), 'base64url').toString('utf8')) as { uid?: string };
        if (typeof payload.uid === 'string' && /^[a-f0-9]{24}$/i.test(payload.uid)) {
            return new ObjectId(payload.uid);
        }
    } catch {
        // ignore
    }
    return new ObjectId(0);
}

export const __test__ = { mintPkceCookie, parsePkceCookie };

// Expose constants used by tests.
export const GOOGLE_PKCE_COOKIE_NAME = PKCE_COOKIE;

// Also export a type-safe reference to the suppressor signature we rely on
// elsewhere. Keeps TS happy in the main server bootstrap.
export type { GoogleOAuthConfig };
