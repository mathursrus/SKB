// ============================================================================
// SKB - Google Business Profile integration (issue #51 Phase D)
// ============================================================================
//
// OSH is the single source of truth for the restaurant's hours, phone, and
// description. This service provides the OAuth 2.0 flow (Authorization Code
// + PKCE) that lets an owner connect their Google Business account, and the
// sync writer that pushes OSH state outward to Google on every admin save.
//
// Design choices:
//
//   * PKCE everywhere, even though we hold the client_secret. The spec says
//     "Confidential clients SHOULD use PKCE" and it costs us nothing to add.
//     The code_verifier lives in an HttpOnly cookie scoped to
//     /r/:loc/api/google/oauth/ for the redirect round-trip only.
//
//   * refreshToken is treated like passwordHash: it must never leave this
//     module via an API response. `toPublicGoogleToken()` is the guard. Tests
//     assert this contract explicitly (same "never in response" coverage as
//     User.passwordHash).
//
//   * Tenant isolation: every lookup keys on locationId. The upstream route
//     layer enforces requireRole({owner, admin}) with tenant-bound cookies,
//     so a caller who successfully reaches this service has already proven
//     they operate the location in question. Cross-tenant probes are
//     explicitly tested.
//
//   * Credential-missing fallback: the OSH admin card surfaces a clear
//     "ask your OSH admin to configure Google credentials" message and
//     the Connect button is disabled. The rest of OSH keeps working.
//     This is gated on GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET presence.
//
//   * Sync failures never fail the admin save. We record lastSyncError on
//     the token row and emit a `gbp.sync.fail` ops-log line; the user can
//     retry from the Settings card. Partial visibility, not a cross-system
//     transaction.
//
// External shape:
//   - buildAuthUrl({...}) / exchangeCode / refreshAccessToken / revokeRefreshToken
//   - generatePkcePair() helper
//   - upsertToken / getTokenFor / deleteTokenFor / recordSyncResult
//   - pushToGbp(locationId) — fire-and-forget writer used by host/site-config
//     and config/website POST handlers.
//   - areCredentialsConfigured() — used by routes to pick 503 vs. 200.
//
// ============================================================================

import { createHash, randomBytes, type BinaryLike } from 'node:crypto';
import { ObjectId, type Collection } from 'mongodb';

import {
    getDb,
    googleTokens,
    locations as locationsColl,
} from '../core/db/mongo.js';
import type { Location, WeeklyHours, DayOfWeek, ServiceWindow } from '../types/queue.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Persisted shape for the `google_tokens` collection. One row per tenant.
 * `refreshToken` MUST never appear in an API response — `toPublicGoogleToken`
 * strips it; downstream /status/sync endpoints use that projection.
 */
export interface GoogleToken {
    _id: ObjectId;
    locationId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    accountId?: string;
    locationResourceName?: string;
    connectedAt: Date;
    connectedByUserId: ObjectId;
    lastSyncAt?: Date;
    lastSyncError?: string;
}

/**
 * Public-safe projection. Never exposes accessToken or refreshToken.
 */
export interface PublicGoogleToken {
    locationId: string;
    accountId?: string;
    locationResourceName?: string;
    connectedAt: Date;
    lastSyncAt?: Date;
    lastSyncError?: string;
}

export interface GoogleOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

/** What we return from the Google token endpoint. */
export interface TokenExchangeResult {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;   // seconds until accessToken expiry
    scope: string;
    tokenType: string;
}

export interface PkcePair {
    verifier: string;   // 43-128 char url-safe string
    challenge: string;  // base64url(sha256(verifier))
    method: 'S256';
}

export interface GbpLocationSummary {
    name: string;       // e.g., "accounts/123/locations/456"
    title?: string;     // display name
    address?: string;   // first address line, human-readable
}

export interface GbpAccountSummary {
    name: string;       // e.g., "accounts/123"
    accountName?: string;
}

export interface PushPayload {
    hours?: unknown;         // Google's regularHours structure (opaque to callers)
    phone?: string;
    description?: string;
}

export interface PushResult {
    ok: boolean;
    pushed: { hours: boolean; phone: boolean; description: boolean };
    gbpLocationResourceName?: string;
    error?: string;
}

// ============================================================================
// Credential configuration
// ============================================================================

const OAUTH_SCOPES = [
    'https://www.googleapis.com/auth/business.manage',
    'openid',
    'email',
    'profile',
].join(' ');

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GBP_ACCOUNTS_ENDPOINT = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const GBP_LOCATIONS_V1_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1';

/**
 * Read an env var with OSH_ preferred, GOOGLE_ as legacy fallback.
 * Operators should set `OSH_GOOGLE_CLIENT_ID` etc. — the GOOGLE_* path
 * exists only so an existing dev machine doesn't need to rotate keys.
 */
function readEnv(oshName: string, legacyName: string): string | undefined {
    return process.env[oshName] ?? process.env[legacyName];
}

export function readOAuthConfig(): GoogleOAuthConfig | null {
    const clientId = readEnv('OSH_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID');
    const clientSecret = readEnv('OSH_GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET');
    const redirectUri = readEnv('OSH_GOOGLE_REDIRECT_URI', 'GOOGLE_REDIRECT_URI');
    if (!clientId || !clientSecret) return null;
    // Redirect URI defaults to a SINGLE global callback at
    // `${SKB_PUBLIC_BASE_URL}/api/google/oauth/callback` — this is the one
    // URL the operator registers in Google Cloud. The per-tenant routing
    // is carried in the `state` param, not the URL path.
    return {
        clientId,
        clientSecret,
        redirectUri: redirectUri ?? '',
    };
}

export function areCredentialsConfigured(): boolean {
    return readOAuthConfig() !== null;
}

/**
 * The ONE callback URI that Google Cloud has registered for this OSH
 * deployment. Tenant info rides in the `state` param; this URI is global.
 *
 * Operators can override with `OSH_GOOGLE_REDIRECT_URI` (e.g., when behind
 * Azure Front Door where the externally-visible URL differs from the app's
 * internal public base). Otherwise derived from `SKB_PUBLIC_BASE_URL`.
 */
export function resolveRedirectUri(): string {
    const explicit = readEnv('OSH_GOOGLE_REDIRECT_URI', 'GOOGLE_REDIRECT_URI');
    if (explicit) return explicit;
    const base = process.env.SKB_PUBLIC_BASE_URL || 'http://localhost:3000';
    return `${base.replace(/\/+$/, '')}/api/google/oauth/callback`;
}

// ============================================================================
// PKCE helpers (RFC 7636)
// ============================================================================

function base64url(buf: Buffer | BinaryLike): string {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf as Buffer);
    return b.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function generatePkcePair(): PkcePair {
    // 32 bytes → 43 base64url chars (43-char is the minimum RFC 7636 allows,
    // and well within the 128-char maximum).
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    return { verifier, challenge, method: 'S256' };
}

/** Recompute the challenge from a verifier — test hook + runtime sanity. */
export function pkceChallengeFromVerifier(verifier: string): string {
    return base64url(createHash('sha256').update(verifier).digest());
}

// ============================================================================
// Auth URL + token exchange
// ============================================================================

export interface BuildAuthUrlInput {
    config: GoogleOAuthConfig;
    redirectUri: string;
    state: string;
    pkce: PkcePair;
    /** optional: force consent screen so we reliably get a refresh_token back. */
    prompt?: 'consent' | 'none';
}

export function buildAuthUrl(input: BuildAuthUrlInput): string {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: input.config.clientId,
        redirect_uri: input.redirectUri,
        scope: OAUTH_SCOPES,
        state: input.state,
        code_challenge: input.pkce.challenge,
        code_challenge_method: input.pkce.method,
        access_type: 'offline',  // we need a refresh_token
        include_granted_scopes: 'true',
        prompt: input.prompt ?? 'consent',
    });
    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface ExchangeCodeInput {
    config: GoogleOAuthConfig;
    redirectUri: string;
    code: string;
    codeVerifier: string;
    /** Test hook: inject a custom fetch (defaults to global.fetch). */
    fetchFn?: typeof fetch;
}

export async function exchangeCode(input: ExchangeCodeInput): Promise<TokenExchangeResult> {
    const f = input.fetchFn ?? fetch;
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
        code_verifier: input.codeVerifier,
    });
    const res = await f(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`google token exchange failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const access = typeof data.access_token === 'string' ? data.access_token : '';
    const refresh = typeof data.refresh_token === 'string' ? data.refresh_token : '';
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    const scope = typeof data.scope === 'string' ? data.scope : '';
    const tokenType = typeof data.token_type === 'string' ? data.token_type : 'Bearer';
    if (!access) throw new Error('google token exchange: missing access_token');
    if (!refresh) throw new Error('google token exchange: missing refresh_token (set access_type=offline and prompt=consent)');
    return { accessToken: access, refreshToken: refresh, expiresIn, scope, tokenType };
}

export interface RefreshAccessTokenInput {
    config: GoogleOAuthConfig;
    refreshToken: string;
    fetchFn?: typeof fetch;
}

/**
 * Exchange a long-lived refresh_token for a fresh access_token. Google does
 * not rotate refresh tokens on this call, so we persist only the new access
 * fields — the refresh stays as-is.
 */
export async function refreshAccessToken(
    input: RefreshAccessTokenInput,
): Promise<{ accessToken: string; expiresIn: number }> {
    const f = input.fetchFn ?? fetch;
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
    });
    const res = await f(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`google token refresh failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const access = typeof data.access_token === 'string' ? data.access_token : '';
    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    if (!access) throw new Error('google token refresh: missing access_token');
    return { accessToken: access, expiresIn };
}

/**
 * Revoke a refresh token. Google's /revoke endpoint invalidates the entire
 * grant (all access tokens too). Failure is logged-but-swallowed in the
 * disconnect route because the local row is the source of truth.
 */
export async function revokeRefreshToken(
    refreshToken: string,
    fetchFn: typeof fetch = fetch,
): Promise<void> {
    const body = new URLSearchParams({ token: refreshToken });
    const res = await fetchFn(GOOGLE_REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!res.ok && res.status !== 400) {
        // Google returns 400 for already-revoked tokens; treat that as idempotent.
        const text = await res.text();
        throw new Error(`google revoke failed: ${res.status} ${text.slice(0, 200)}`);
    }
}

// ============================================================================
// Token persistence (tenant-keyed)
// ============================================================================

export function toPublicGoogleToken(row: GoogleToken): PublicGoogleToken {
    const out: PublicGoogleToken = {
        locationId: row.locationId,
        connectedAt: row.connectedAt,
    };
    if (row.accountId) out.accountId = row.accountId;
    if (row.locationResourceName) out.locationResourceName = row.locationResourceName;
    if (row.lastSyncAt) out.lastSyncAt = row.lastSyncAt;
    if (row.lastSyncError) out.lastSyncError = row.lastSyncError;
    return out;
}

async function tokensCollection(): Promise<Collection<GoogleToken>> {
    const db = await getDb();
    return googleTokens(db);
}

export interface UpsertTokenInput {
    locationId: string;
    connectedByUserId: ObjectId;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    accountId?: string;
    locationResourceName?: string;
}

export async function upsertToken(input: UpsertTokenInput): Promise<GoogleToken> {
    const coll = await tokensCollection();
    const now = new Date();
    // Preserve _id and connectedAt across reconnects so downstream audit
    // queries see a stable identity for the grant.
    const existing = await coll.findOne({ locationId: input.locationId });
    const _id = existing?._id ?? new ObjectId();
    const connectedAt = existing?.connectedAt ?? now;
    const doc: GoogleToken = {
        _id,
        locationId: input.locationId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        connectedAt,
        connectedByUserId: input.connectedByUserId,
    };
    if (input.accountId) doc.accountId = input.accountId;
    if (input.locationResourceName) doc.locationResourceName = input.locationResourceName;
    await coll.replaceOne(
        { locationId: input.locationId },
        doc,
        { upsert: true },
    );
    return doc;
}

export async function getTokenFor(locationId: string): Promise<GoogleToken | null> {
    const coll = await tokensCollection();
    return coll.findOne({ locationId });
}

export async function deleteTokenFor(locationId: string): Promise<void> {
    const coll = await tokensCollection();
    await coll.deleteOne({ locationId });
}

export async function setLinkedLocation(
    locationId: string,
    locationResourceName: string,
): Promise<void> {
    const coll = await tokensCollection();
    await coll.updateOne(
        { locationId },
        { $set: { locationResourceName } },
    );
}

export async function recordSyncResult(
    locationId: string,
    result: { ok: boolean; error?: string },
): Promise<void> {
    const coll = await tokensCollection();
    if (result.ok) {
        await coll.updateOne(
            { locationId },
            { $set: { lastSyncAt: new Date() }, $unset: { lastSyncError: '' } },
        );
    } else {
        await coll.updateOne(
            { locationId },
            { $set: { lastSyncAt: new Date(), lastSyncError: result.error ?? 'unknown error' } },
        );
    }
}

// ============================================================================
// GBP Business Information API calls
// ============================================================================

/** Small wrapper around fetch that (a) attaches Bearer, (b) refreshes on 401. */
async function gbpFetch(
    locationId: string,
    url: string,
    init: RequestInit,
    fetchFn: typeof fetch,
): Promise<Response> {
    const config = readOAuthConfig();
    if (!config) throw new Error('google credentials not configured');
    const row = await getTokenFor(locationId);
    if (!row) throw new Error('google not connected for this location');
    let bearer = row.accessToken;
    // Proactive refresh if the stored access token is known-expired (with a
    // 60s skew to absorb clock drift).
    if (row.expiresAt.getTime() - 60_000 <= Date.now()) {
        const r = await refreshAccessToken({ config, refreshToken: row.refreshToken, fetchFn });
        bearer = r.accessToken;
        const coll = await tokensCollection();
        await coll.updateOne(
            { locationId },
            { $set: { accessToken: r.accessToken, expiresAt: new Date(Date.now() + r.expiresIn * 1000) } },
        );
    }
    const doFetch = async (bearerTok: string): Promise<Response> => fetchFn(url, {
        ...init,
        headers: {
            ...(init.headers ?? {}),
            Authorization: `Bearer ${bearerTok}`,
            'Content-Type': 'application/json',
        },
    });
    let res = await doFetch(bearer);
    if (res.status === 401) {
        // Reactive refresh — access expired between the proactive check and
        // the request (or the proactive check decided the token was still OK
        // but Google disagreed). One retry is enough; if the refresh itself
        // 401s we surface the error.
        const r = await refreshAccessToken({ config, refreshToken: row.refreshToken, fetchFn });
        const coll = await tokensCollection();
        await coll.updateOne(
            { locationId },
            { $set: { accessToken: r.accessToken, expiresAt: new Date(Date.now() + r.expiresIn * 1000) } },
        );
        res = await doFetch(r.accessToken);
    }
    return res;
}

export async function listGbpAccounts(
    locationId: string,
    fetchFn: typeof fetch = fetch,
): Promise<GbpAccountSummary[]> {
    const res = await gbpFetch(locationId, GBP_ACCOUNTS_ENDPOINT, { method: 'GET' }, fetchFn);
    if (!res.ok) throw new Error(`gbp accounts list failed: ${res.status}`);
    const data = (await res.json()) as { accounts?: Array<Record<string, unknown>> };
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    return accounts.map((a) => ({
        name: typeof a.name === 'string' ? a.name : '',
        accountName: typeof a.accountName === 'string' ? a.accountName : undefined,
    }));
}

export async function listGbpLocationsForAccount(
    locationId: string,
    accountResourceName: string,
    fetchFn: typeof fetch = fetch,
): Promise<GbpLocationSummary[]> {
    const url = `${GBP_LOCATIONS_V1_BASE}/${accountResourceName}/locations`
        + '?readMask=name,title,storefrontAddress';
    const res = await gbpFetch(locationId, url, { method: 'GET' }, fetchFn);
    if (!res.ok) throw new Error(`gbp locations list failed: ${res.status}`);
    const data = (await res.json()) as { locations?: Array<Record<string, unknown>> };
    const rows = Array.isArray(data.locations) ? data.locations : [];
    return rows.map((l) => {
        const addr = (l.storefrontAddress as Record<string, unknown> | undefined) ?? {};
        const lines = Array.isArray(addr.addressLines) ? addr.addressLines.join(', ') : '';
        const city = typeof addr.locality === 'string' ? addr.locality : '';
        const state = typeof addr.administrativeArea === 'string' ? addr.administrativeArea : '';
        const addressStr = [lines, [city, state].filter(Boolean).join(', ')]
            .filter(Boolean)
            .join(' · ');
        return {
            name: typeof l.name === 'string' ? l.name : '',
            title: typeof l.title === 'string' ? l.title : undefined,
            address: addressStr || undefined,
        };
    });
}

// ============================================================================
// OSH → GBP translation
// ============================================================================

// Google's regularHours uses MONDAY/TUESDAY/... open/close with hours/minutes.
const DAY_MAP: Record<DayOfWeek, string> = {
    mon: 'MONDAY',
    tue: 'TUESDAY',
    wed: 'WEDNESDAY',
    thu: 'THURSDAY',
    fri: 'FRIDAY',
    sat: 'SATURDAY',
    sun: 'SUNDAY',
};

function windowToPeriod(day: string, w: ServiceWindow): Record<string, unknown> {
    const [oH, oM] = w.open.split(':').map((x) => parseInt(x, 10));
    const [cH, cM] = w.close.split(':').map((x) => parseInt(x, 10));
    return {
        openDay: day,
        openTime: { hours: oH, minutes: oM },
        closeDay: day,
        closeTime: { hours: cH, minutes: cM },
    };
}

/** Convert OSH WeeklyHours into the shape GBP's Locations API expects. */
export function weeklyHoursToRegularHours(hours: WeeklyHours | undefined): Record<string, unknown> | null {
    if (!hours) return null;
    const periods: Array<Record<string, unknown>> = [];
    for (const key of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayOfWeek[]) {
        const v = hours[key];
        if (!v || v === 'closed') continue;
        const gDay = DAY_MAP[key];
        if (v.lunch) periods.push(windowToPeriod(gDay, v.lunch));
        if (v.dinner) periods.push(windowToPeriod(gDay, v.dinner));
    }
    if (periods.length === 0) return { periods: [] };
    return { periods };
}

/**
 * Normalize the 10-digit OSH phone into E.164 for GBP. Empty / malformed →
 * null; the caller decides to skip the phone field in that case rather than
 * push a bad value.
 */
export function normalizePhone(phone?: string): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return null;
}

/**
 * Build the PATCH payload we send to GBP. Pure function — no I/O — so the
 * shape is easy to unit-test without mocking fetch.
 */
export function buildGbpPatchPayload(location: Location): PushPayload {
    const hours = weeklyHoursToRegularHours(location.hours);
    const phone = normalizePhone(location.frontDeskPhone);
    const description = (location.content?.about ?? '').trim() || undefined;
    const out: PushPayload = {};
    if (hours) out.hours = hours;
    if (phone) out.phone = phone;
    if (description) out.description = description;
    return out;
}

/** Which of the three fields we *tried* to push (for the response shape). */
export function pushedFlags(payload: PushPayload): { hours: boolean; phone: boolean; description: boolean } {
    return {
        hours: payload.hours !== undefined,
        phone: payload.phone !== undefined,
        description: payload.description !== undefined,
    };
}

// ============================================================================
// Sync writer
// ============================================================================

export interface PushToGbpOpts {
    fetchFn?: typeof fetch;
    /** If the token row has no locationResourceName, auto-pick the sole one
     *  on the account. When the account has multiple locations, push fails
     *  with a descriptive error instructing the owner to pick one. */
    autoPickSingleLocation?: boolean;
}

export async function pushToGbp(locationId: string, opts: PushToGbpOpts = {}): Promise<PushResult> {
    const fetchFn = opts.fetchFn ?? fetch;
    const autoPick = opts.autoPickSingleLocation ?? true;
    const token = await getTokenFor(locationId);
    if (!token) return { ok: false, pushed: { hours: false, phone: false, description: false }, error: 'not connected' };

    const db = await getDb();
    const loc = await locationsColl(db).findOne({ _id: locationId });
    if (!loc) return { ok: false, pushed: { hours: false, phone: false, description: false }, error: 'location not found' };

    let resourceName = token.locationResourceName;
    if (!resourceName) {
        if (!autoPick) {
            return { ok: false, pushed: { hours: false, phone: false, description: false }, error: 'no gbp location linked — pick one in Settings' };
        }
        // Auto-pick: if the account has a single location, link it; else bail.
        try {
            const accounts = await listGbpAccounts(locationId, fetchFn);
            if (accounts.length === 0) {
                return { ok: false, pushed: { hours: false, phone: false, description: false }, error: 'no gbp accounts on this Google login' };
            }
            const acc = accounts[0]; // pick the first — small-business case
            const locs = await listGbpLocationsForAccount(locationId, acc.name, fetchFn);
            if (locs.length === 0) {
                return { ok: false, pushed: { hours: false, phone: false, description: false }, error: 'gbp account has no locations' };
            }
            if (locs.length > 1) {
                return { ok: false, pushed: { hours: false, phone: false, description: false }, error: 'gbp account has multiple locations — pick one' };
            }
            resourceName = locs[0].name;
            await upsertToken({
                locationId,
                connectedByUserId: token.connectedByUserId,
                accessToken: token.accessToken,
                refreshToken: token.refreshToken,
                expiresAt: token.expiresAt,
                accountId: acc.name,
                locationResourceName: resourceName,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, pushed: { hours: false, phone: false, description: false }, error: msg };
        }
    }

    const payload = buildGbpPatchPayload(loc);
    const flags = pushedFlags(payload);

    // Construct the GBP PATCH body + updateMask.
    const updateMaskParts: string[] = [];
    const patchBody: Record<string, unknown> = {};
    if (payload.hours !== undefined) {
        patchBody.regularHours = payload.hours;
        updateMaskParts.push('regularHours');
    }
    if (payload.phone !== undefined) {
        patchBody.phoneNumbers = { primaryPhone: payload.phone };
        updateMaskParts.push('phoneNumbers.primaryPhone');
    }
    if (payload.description !== undefined) {
        patchBody.profile = { description: payload.description };
        updateMaskParts.push('profile.description');
    }
    if (updateMaskParts.length === 0) {
        // Nothing to push — still record a successful sync so the UI shows
        // "last sync: now" instead of a stale timestamp.
        await recordSyncResult(locationId, { ok: true });
        return { ok: true, pushed: flags, gbpLocationResourceName: resourceName };
    }

    const url = `${GBP_LOCATIONS_V1_BASE}/${resourceName}?updateMask=${encodeURIComponent(updateMaskParts.join(','))}`;
    try {
        const res = await gbpFetch(locationId, url, {
            method: 'PATCH',
            body: JSON.stringify(patchBody),
        }, fetchFn);
        if (!res.ok) {
            const text = await res.text();
            const err = `gbp patch failed: ${res.status} ${text.slice(0, 200)}`;
            await recordSyncResult(locationId, { ok: false, error: err });
            return { ok: false, pushed: flags, gbpLocationResourceName: resourceName, error: err };
        }
        await recordSyncResult(locationId, { ok: true });
        return { ok: true, pushed: flags, gbpLocationResourceName: resourceName };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await recordSyncResult(locationId, { ok: false, error: msg });
        return { ok: false, pushed: flags, gbpLocationResourceName: resourceName, error: msg };
    }
}

/**
 * Fire-and-forget wrapper used by the admin-save handlers. Never throws.
 * Logs a structured ops line so the sync path is observable independent of
 * the user-facing response.
 */
export function pushToGbpBackground(locationId: string): void {
    // If not connected, skip silently — the admin-save shouldn't notice.
    void (async () => {
        try {
            const token = await getTokenFor(locationId);
            if (!token) return;
            const result = await pushToGbp(locationId);
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: result.ok ? 'info' : 'warn',
                msg: result.ok ? 'gbp.sync.ok' : 'gbp.sync.fail',
                loc: locationId,
                pushed: result.pushed,
                gbp: result.gbpLocationResourceName,
                err: result.error,
            }));
        } catch (err) {
            console.log(JSON.stringify({
                t: new Date().toISOString(),
                level: 'error',
                msg: 'gbp.sync.fail',
                loc: locationId,
                err: err instanceof Error ? err.message : String(err),
            }));
        }
    })();
}

// Test-only surface.
export const __test__ = {
    OAUTH_SCOPES,
    GOOGLE_AUTH_ENDPOINT,
    GOOGLE_TOKEN_ENDPOINT,
    GOOGLE_REVOKE_ENDPOINT,
    GBP_LOCATIONS_V1_BASE,
    base64url,
};
