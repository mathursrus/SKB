# Security Review: repo

Date: 2026-04-24
Scope: full repository review of `mathursrus/SKB` on branch `master`
Reviewer: Codex via FRAIM `security-review`

## Executive Summary

Overall status: Fail

The application has solid baseline controls in several areas: Twilio webhook signature validation defaults closed, named-user passwords are hashed, queue join and guest chat/order routes are rate-limited, SMS opt-out handling exists, image upload handling uses an allowlist and content-addressed filenames, and no committed production secrets were found by pattern scan.

The main risks are concentrated in authentication/session handling and operational secret exposure:

1. High: host/MCP PIN auth is brute-forceable and the default bootstrap PIN is `1234`.
2. High: legacy host cookies without tenant binding are still accepted across tenants.
3. Medium: auth and OAuth cookies are missing the `Secure` attribute.
4. Medium: password reset and staff invite tokens are logged unconditionally.
5. Medium: `npm audit` reports three moderate dependency advisories.

No auto-fixes were applied. The highest-risk issues touch auth/session behavior and should be changed with explicit human review plus regression tests.

## Threat Surfaces

| Surface | Notes |
| --- | --- |
| Public diner routes | `/queue/join`, `/queue/status`, `/queue/chat/:code`, `/queue/order/*`, public website pages |
| Host/admin routes | `/host/login`, queue mutation, seating, chat, analytics, staff invite/revoke, config, website/menu updates |
| Platform auth | `/api/login`, `/api/logout`, `/api/me`, password reset, invite acceptance, signup |
| Webhooks | Twilio SMS inbound/status, optional voice routes |
| MCP | `/mcp` exposes host/admin operations with Bearer PIN auth |
| Static assets | `public/`, tenant assets under `/assets`, inline image persistence |
| Data stores | MongoDB collections for locations, queue entries, users, memberships, invites, password resets, Google tokens |
| External providers | Twilio, Google Business Profile, GitHub issue integration, Azure Communication Services spike code |

## Coverage Matrix

| Category | Status | Evidence |
| --- | --- | --- |
| OWASP A01 Broken Access Control | Fail | Legacy host cookies accepted without tenant binding in `src/middleware/hostAuth.ts:114` and `src/middleware/hostAuth.ts:438`; integration test confirms cross-tenant acceptance in `tests/integration/multi-tenancy.integration.test.ts:255`. |
| OWASP A02 Cryptographic Failures | Fail | Auth/OAuth cookies are `HttpOnly` and `SameSite` but not `Secure` in `src/routes/auth.ts:60`, `src/routes/signup.ts:119`, `src/routes/host.ts:123`, and `src/routes/google.ts:137`. |
| OWASP A03 Injection | Pass | Primary reviewed request inputs validate IDs/shape; image upload filenames are hash-derived and slug sanitized in `src/services/siteAssets.ts`. Full DOM-XSS proof was not exhaustive due broad client `innerHTML` usage. |
| OWASP A04 Insecure Design | Fail | Default PIN and PIN-as-Bearer model create a weak shared-secret design for host and MCP access. |
| OWASP A05 Security Misconfiguration | Fail | Bootstrap creates SKB with default PIN `1234` when env is missing in `src/mcp-server.ts:367`; README documents the default in `README.md:27`. |
| OWASP A06 Vulnerable Components | Fail | `npm audit --audit-level=low --json` reports 3 moderate vulnerabilities. |
| OWASP A07 Identification and Authentication Failures | Fail | Host PIN and MCP Bearer PIN auth have no rate limit or lockout at `src/routes/host.ts:98` and `src/mcp/auth.ts:49`; named login has lockout coverage in `src/middleware/loginLockout.ts:25`. |
| OWASP A08 Software and Data Integrity Failures | Pass | No unsafe dynamic code execution found in server code; no install scripts reviewed as suspicious. |
| OWASP A09 Security Logging and Monitoring Failures | Fail | Sensitive reset/invite tokens are emitted to logs in `src/services/passwordResets.ts:93` and `src/routes/host.ts:1073`. |
| OWASP A10 SSRF | Pass | No user-controlled server-side URL fetch surface found in reviewed routes. Google OAuth token exchange uses fixed provider endpoints. |
| API Security | Fail | MCP API uses the same short shared PIN as an API bearer credential and lacks lockout. |
| Privacy / PII | Fail | Tokens and emails are logged during reset/invite flows; phone numbers are mostly masked in SMS logs. |
| Secrets in code | Pass | Pattern scan found examples/placeholders only; `.env.local` is present locally but ignored by `.gitignore`. |
| Capability authoring / MCP | Fail | MCP exposes operational tools through low-entropy Bearer PIN auth with no rate limiting. |

## Findings

### SEC-001: Host and MCP PIN auth is brute-forceable and defaults to `1234`

Severity: High
OWASP: A07 Identification and Authentication Failures, A05 Security Misconfiguration, API Security

Evidence:

- `src/routes/host.ts:98` defines `POST /host/login` without rate limiting or lockout.
- `src/routes/host.ts:103` falls back to `process.env.SKB_HOST_PIN`.
- `src/mcp/auth.ts:49` validates MCP Bearer PINs directly with no rate limiter.
- `src/mcp-server.ts:367` bootstraps the default location with `process.env.SKB_HOST_PIN ?? '1234'`.
- `README.md:27` documents host PIN default as `1234`.

Impact:

An attacker can online-guess a 4 to 6 digit PIN against host login or `/mcp`. Successful compromise grants host waitlist operations and, through MCP tools, broader operational control for a location.

Recommended remediation:

- Remove production fallback to `1234`; fail closed when `SKB_HOST_PIN` is absent outside test/dev.
- Add per-IP and per-location lockout for host PIN and MCP auth, similar to named login lockout.
- Prefer named user auth for MCP or issue separate high-entropy MCP API tokens scoped by tenant and role.
- Add tests proving repeated bad PINs return `429` and good PINs recover after lockout expiry.

### SEC-002: Tenant-unbound legacy host cookies are accepted across tenants

Severity: High
OWASP: A01 Broken Access Control

Evidence:

- `src/middleware/hostAuth.ts:114` accepts 2-segment legacy cookies that contain only `<exp>.<mac>`.
- `src/middleware/hostAuth.ts:438` only enforces tenant mismatch when the cookie is not legacy and has a `lid`.
- `src/middleware/hostAuth.ts:463` logs legacy cookie acceptance but still authorizes.
- `tests/integration/multi-tenancy.integration.test.ts:255` explicitly verifies that a legacy cookie is accepted at a different tenant.

Impact:

Any valid legacy host cookie signed with the shared cookie secret is usable against every tenant until expiry. In a multi-tenant restaurant platform, that weakens tenant isolation and can allow cross-restaurant queue access/mutation if an old cookie leaks.

Recommended remediation:

- End the legacy acceptance window and reject 2-segment cookies.
- If backward compatibility is unavoidable, allow legacy cookies only for the original `skb` tenant and with a very short sunset date.
- Add regression tests proving legacy cookies return `401` for all tenant-scoped host routes.

### SEC-003: Auth cookies are missing `Secure`

Severity: Medium
OWASP: A02 Cryptographic Failures

Evidence:

- Named session cookie: `src/routes/auth.ts:60`
- Signup session cookie: `src/routes/signup.ts:119`
- Host cookie: `src/routes/host.ts:123`
- Legacy host cookie: `src/middleware/hostAuth.ts:536`
- Google PKCE cookie: `src/routes/google.ts:137`

Impact:

If any production request is served or redirected over plaintext HTTP, browsers may send session or OAuth verifier cookies without TLS. `HttpOnly` protects against script reads, but not transport leakage.

Recommended remediation:

- Add `Secure` for production cookies.
- Set `app.set('trust proxy', 1)` if deployed behind Azure/App Service proxying and gate local dev behavior with `NODE_ENV !== 'production'`.
- Add tests asserting production `Set-Cookie` includes `Secure`, `HttpOnly`, and `SameSite`.

### SEC-004: Password reset and invite tokens are logged unconditionally

Severity: Medium
OWASP: A09 Security Logging and Monitoring Failures, Privacy / PII

Evidence:

- `src/services/passwordResets.ts:93` logs the reset email payload.
- `src/services/passwordResets.ts:100` through `src/services/passwordResets.ts:105` include `token` and `link`.
- `src/routes/host.ts:1073` logs staff invite creation.
- `src/routes/host.ts:1081` through `src/routes/host.ts:1085` include the invite `token` and `link`.

Impact:

Anyone with production log access can take over accounts via password reset tokens or accept staff invites. Logs often have broader retention and access than application databases, so this creates an unnecessary credential exposure path.

Recommended remediation:

- Gate token logging to explicit local/dev mode only.
- In production, hand reset/invite links to a mailer and log only token hash prefix, user/location, and delivery status.
- Add tests asserting production logs do not contain raw reset or invite tokens.

### SEC-005: Moderate dependency advisories are present

Severity: Medium
OWASP: A06 Vulnerable and Outdated Components

Evidence:

`npm audit --audit-level=low --json` reported:

- `hono <=4.12.13`: multiple moderate advisories, including cookie handling, path traversal in SSG, middleware bypass, and JSX attribute HTML injection.
- `@hono/node-server <1.19.13`: middleware bypass via repeated slashes in `serveStatic`.
- `follow-redirects <=1.15.11`: custom authentication headers can leak to cross-domain redirect targets.

Impact:

These are transitive dependencies, but the advisories include web routing/static-serving and credential-header leakage classes. Even if not directly reachable today, they increase maintenance risk.

Recommended remediation:

- Run `npm audit fix` or update the parent dependency that brings in `hono` / `@hono/node-server` / `follow-redirects`.
- Re-run `npm audit --audit-level=low`.
- Confirm no lockfile-only drift breaks the TypeScript build or tests.

## Positive Controls Observed

- Twilio webhook validation fails closed when `TWILIO_AUTH_TOKEN` is missing; the unsigned bypass requires `SKB_ALLOW_UNSIGNED_TWILIO=1` and logs a warning.
- Named login has an in-memory 5-attempt lockout window.
- Passwords use `argon2`.
- Invite and reset tokens are stored hashed, not raw.
- Public queue join/chat/order routes have rate limiting.
- Location asset upload blocks SVG, enforces a 2 MiB decoded limit, uses safe slugs, and writes hash-derived filenames.
- `.gitignore` excludes `.env`, `.env.local`, and `.env.*.local`.

## Remediation Queue

1. Remove default host PIN and add host/MCP PIN lockout.
2. Reject legacy tenant-unbound host cookies.
3. Add production `Secure` cookies for session, host, signup, and Google PKCE flows.
4. Stop logging raw reset and invite tokens in production.
5. Update vulnerable transitive dependencies and re-run audit.
6. Add security regression tests for each auth/session remediation.

## Verification Evidence

- `npm run typecheck`: passed.
- `npm audit --audit-level=low --json`: failed with 3 moderate vulnerabilities.
- Secret pattern scan with `rg`: no committed production secrets found; examples and test placeholders only.
- Targeted source review: `src/mcp-server.ts`, `src/routes/auth.ts`, `src/routes/host.ts`, `src/routes/queue.ts`, `src/routes/sms.ts`, `src/routes/google.ts`, `src/middleware/hostAuth.ts`, `src/middleware/twilioValidation.ts`, `src/mcp/auth.ts`, `src/mcp/server.ts`, `src/services/passwordResets.ts`, `src/services/siteAssets.ts`.

## Compliance Mapping

| Control Area | Result | Notes |
| --- | --- | --- |
| SOC 2 CC6 logical access | Fail | Shared PIN auth lacks rate limiting; legacy cross-tenant cookie acceptance weakens access control. |
| SOC 2 CC7 monitoring | Partial | Security-relevant logs exist, but sensitive tokens are logged. |
| ISO 27001 A.5/A.8 access management | Fail | Default/shared PIN and tenant-unbound legacy cookies need remediation. |
| Privacy / PII minimization | Fail | Raw reset and invite tokens plus email addresses are logged. |

## Deferred / Not Reviewed Exhaustively

- Full browser DOM-XSS audit of every `innerHTML` call was not completed. Many render paths appear to use escaping helpers, but the volume warrants a dedicated client-side XSS pass.
- Production Azure ingress/TLS settings were not verified from infrastructure configuration.
- MongoDB user privileges and network allowlists were not reviewed.
