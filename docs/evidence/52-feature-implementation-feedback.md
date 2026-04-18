# Issue #52 — Feature Implementation Feedback / Quality Report

## Summary
All quality checks pass. One self-identified duplication was found and factored out. No remaining unaddressed issues.

## Findings

### 1. [ADDRESSED] Duplicate verify logic in `verifyCookieDetailed`
- **Category**: DRY (duplicate code)
- **File**: `src/middleware/hostAuth.ts`
- **Original**: The 3-segment and 2-segment verification branches each repeated the `/^\d+$/` regex, the 64-char MAC length guard, the `exp * 1000 <= now.getTime()` expiry check, and the `timingSafeEqual` compare with its `try/catch`.
- **Fix**: Derived the cookie shape (`lid`, `macInput`, `legacy`) once at the top of the branch, then ran a single shared verification tail. ~20 lines of duplication removed without changing semantics. All 27 unit tests + 20 integration tests re-ran green after the refactor.

## Architecture Standards Compliance

- **AI vs deterministic separation**: N/A (no AI/LLM logic).
- **Clean architecture layers**: Middleware and route layer only — no infrastructure layer added.
- **Testability**: Middleware factory (`requireRole`) takes all dependencies from the request and env, so it is unit-testable without a running server (11 new unit tests cover it directly; 20 integration tests cover the end-to-end wiring).
- **Security & configuration**: `SKB_COOKIE_SECRET` and `SKB_HOST_PIN` are read from env. No hardcoded credentials. The new cookie format covers the `lid` in the MAC input so an attacker cannot swap the lid prefix on a captured cookie (validated by the "tampered: swap lid" integration test).
- **DRY principle**: Deduplicated the dual-format verifier (see finding #1). Consolidated `COOKIE_NAME` / `MAX_AGE_SECONDS` / `sign` / `mintLocationCookie` into `middleware/hostAuth.ts` and deleted the duplicates that were in `routes/host.ts`.
- **Code organization**:
  - `src/middleware/hostAuth.ts`: 300 lines, 8 exports (`VerifyResult`, `verifyCookieDetailed`, `verifyCookie`, `readCookie`, `HostAuthContext`, `requireRole`, `requireHost`, `loginHandler`, `logoutHandler`, `HOST_COOKIE_NAME`, `HOST_COOKIE_MAX_AGE_SECONDS`, `mintLocationCookie`). Under the 500-line threshold.
  - `src/routes/host.ts`: ~710 lines total, unchanged in scope; net -30 lines after removing duplicated helpers. File is already beyond 500 lines for reasons predating this issue; splitting it belongs to a future refactor, not this PR.
- **Function sizes**: `verifyCookieDetailed` 35 lines, `requireRole` middleware body 30 lines, `loginHandler` 38 lines. All under the 50-line guideline.
- **Pattern discovery (reuse before create)**: Reused the existing `sign()` helper, the existing `readCookie()` pattern, the existing `emitLog()` JSON-structured log format, and the existing `loc(req)` helper in routes.

## Security Notes

- Cross-tenant cookie replay is now blocked (R1). HMAC covers the lid, so attackers cannot prefix-swap.
- Legacy cookie acceptance is a deliberate, time-boxed softening (spec §8.4, two-release window). Every legacy acceptance emits `auth.legacy-cookie.accept` so operators can verify flight counts before flipping acceptance off.
- `403 wrong_tenant` vs `401 unauthorized`: deliberate distinction — a cross-tenant cookie-holder IS authenticated, just not for THIS tenant. Matches the spec wording.
- No PII added to logs beyond what was already there (`loc`, `ip`). Cookie values are never logged.

## UX / UI
N/A — no UI touched.
