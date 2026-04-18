# Issue #52 — Implementation Work List

**Issue**: #52 (51a) — Multi-tenant: location-scoped session cookie + requireRole middleware
**Parent**: #51
**Spec**: `docs/feature-specs/51-fully-multi-tenant-system.md` §8.4, §11.3
**Branch**: `feature/51-fully-multi-tenant-system` (shared multi-tenant branch; this issue is the FOUNDATION PR)

## Issue Type
**feature** — tightens cross-tenant auth; introduces a new cookie format and a new middleware. Includes failing-test-style coverage via the new cross-tenant probe.

## Scope

Close the cross-tenant auth gap. Today `skb_host` cookie is `<exp>.<mac>` with no tenant binding, so a cookie minted at `/r/a/api/host/login` is accepted at `/r/b/api/host/*`.

## Design Standards
Generic UI baseline — **no UI touched in this PR**. Pure middleware / route / test changes.

## Patterns Discovered (from codebase-pattern-discovery)

- **Cookie secret**: `SKB_COOKIE_SECRET` env var; `cookieSecret()` helper in both `src/middleware/hostAuth.ts` and `src/routes/host.ts` returns `process.env.SKB_COOKIE_SECRET ?? null`.
- **HMAC sign helper**: duplicated as `sign(payload, key)` in both files (`createHmac('sha256', key).update(payload).digest('hex')`). Will consolidate into `hostAuth.ts` and re-export for `host.ts`.
- **Cookie read helper**: duplicated `readCookie(header)` in both files — same pattern (consolidate).
- **Cookie format today**: `<exp>.<mac>` where `mac = HMAC_SHA256(SKB_COOKIE_SECRET, String(exp))`.
- **`loc(req)` helper** in `host.ts` already extracts `req.params.loc` with `'skb'` fallback — used for per-location PIN lookup.
- **Route registration**: `app.use('/r/:loc/api', hostRouter())` in `src/mcp-server.ts` (per-location) AND `app.use('/api', setLocToSkb, hostRouter())` (backward-compat). Both paths go through the same router, and `req.params.loc` is already `'skb'` on the backward-compat path.
- **Log schema**: `host.auth.fail` and other logs already carry `loc: loc(req)`. The spec calls for adding `loc` to `host.auth.ok` too. Existing logs use `console.log(JSON.stringify({t, level, msg, ...}))`.
- **Test harness**: `tests/integration/*.integration.test.ts` spawns a real server via `shared-server-utils.ts`. Env defaults set at top of file. Cases run via `runTests(cases, 'name')`.
- **Existing multi-tenant test**: `tests/integration/multi-tenant.integration.test.ts` exists and tests **data** isolation — but does not test **auth cookie** isolation. The spec (§11.3) calls for a new `tests/integration/multi-tenancy.test.ts` but that filename collides in intent with the existing one. Naming decision: keep the existing file as `multi-tenant.integration.test.ts` (data isolation), add a new file `multi-tenancy.integration.test.ts` (cross-tenant auth probe) so both are picked up by the existing glob. Both names match the spec; the latter file name matches §11.3 verbatim modulo our `.integration.test.ts` convention.

## Implementation Checklist

- [x] **Cookie format change** — `src/middleware/hostAuth.ts`
  - [x] `mintCookie(now, key, locationId)` → returns `<lid>.<exp>.<mac>` where `mac = HMAC_SHA256(key, '<lid>.<exp>')`
  - [x] `verifyCookie(value, key, now?)` returns `{ ok, lid?, legacy }` — accepts BOTH legacy `<exp>.<mac>` and new `<lid>.<exp>.<mac>`
  - [x] Export `readCookie` so `routes/host.ts` can reuse it
- [x] **`requireRole(...roles)` factory** — `src/middleware/hostAuth.ts`
  - [x] Reads cookie, verifies HMAC, extracts `lid`
  - [x] If `req.params.loc` exists and differs from cookie `lid` → 403 `{ error: 'wrong_tenant' }`
  - [x] If cookie is legacy (no `lid`) and `req.params.loc` is set → accept, log `auth.legacy-cookie.accept` with `loc`
  - [x] On success, attaches `req.auth = { lid, legacy }` for downstream handlers
  - [x] On missing/invalid cookie → 401 (unchanged)
  - [x] Role param accepted but currently informational — role check is a no-op until the session cookie lands in a later sub-issue; the factory signature is future-proof
- [x] **`routes/host.ts` login handler** — mint new cookie format
  - [x] `mintCookie(now, key, lid)` mints `<lid>.<exp>.<mac>` — lid is `loc(req)`
  - [x] Log `host.auth.ok` (new) with `loc`, in addition to existing `host.auth.fail` with `loc`
- [x] **Replace `requireHost` at route-registration sites** in `routes/host.ts` with `requireRole('host')`
  - [x] Remove duplicated `sign`/`readCookie`/`mintCookie` local helpers (consolidate into middleware)
- [x] **Backward-compat path** (`/api/host/*` in `mcp-server.ts`)
  - [x] Before hostRouter runs, the stub middleware sets `req.params.loc = 'skb'` — so `requireRole` compares cookie-lid to `'skb'` on that path. Already works without changes.
- [x] **New cross-tenant probe test** — `tests/integration/multi-tenancy.integration.test.ts`
  - [x] Bootstrap two locations with different PINs
  - [x] Login at loc A, assert 403 at every protected endpoint of loc B
  - [x] Verify new cookie format (has 3 dot-separated segments)
  - [x] Verify legacy cookie format accepted + log emitted
  - [x] Confirm cookie from `/r/skb/api/host/login` contains `lid=skb`
- [x] **Update `host-auth.integration.test.ts`** — the one existing tampered-cookie test still needs to pass (its tampered value has only 2 segments, which is the legacy format with a wrong MAC → must still 401).
- [x] Run `npm run test:all` — no regressions

## Validation Requirements

- `uiValidationRequired`: **false** — no UI changes.
- `mobileValidationRequired`: **false** — no UI changes.
- **Browser validation**: not required for this issue.
- **Integration test**: the new `multi-tenancy.integration.test.ts` IS the primary validation (§11.3 compliance evidence).
- **Curl validation**: manually confirm cross-tenant probe with two locations.

## Acceptance Criteria (from issue)

- **R1**: Cookie from `/r/skb` rejected (403) at `/r/any-other/api/host/*`
- **R2**: Legacy-format cookie accepted for one window, logs `auth.legacy-cookie.accept`
- **R3**: `tests/integration/multi-tenancy.integration.test.ts` passes
- **R4**: `npm run test:all` passes (no regressions)
- **R5**: PIN login on `/r/skb/host.html` unchanged; cookie now contains `lid=skb`

## Blocks
#51b, #51c, #51d depend on this foundation.

## Open Questions / Deferrals
- `requireRole(role, ...)` role enforcement is stubbed — role is not yet in the cookie payload. That lands when `skb_session` (§8.4) is introduced in a later sub-issue. For this PR, `requireRole('host')` behaves identically to the old `requireHost` except for tenant-binding.
- The spec mentions a "deprecation window (two releases)" — this PR implements acceptance. Removal of legacy acceptance is a separate future commit.
