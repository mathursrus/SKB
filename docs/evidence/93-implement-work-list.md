# Issue #93 — Standing Work List

## Scope summary

Two bugs uncovered while testing the iOS Staff section:

1. **GET /staff returns 503 even for the owner.** Server returns the opaque `temporarily unavailable` body. The actual cause is one of three sources in `hostAuth` / `host.ts`. Fix requires (a) finding the real cause, (b) surfacing a useful error to the client.
2. **Staff invite emails are never sent.** `src/routes/host.ts:1170-1183` and `src/services/welcomeEmail.ts:39+` are `console.log` stubs. Replace with Azure Communication Services Email + env-gated fallback to log-only.

Issue type: **bug** (both)

## Implementation checklist

### Bug 1 — /staff 503 diagnostic + fix

- [ ] `src/middleware/hostAuth.ts` — Distinguish auth-config 503 from membership-lookup-throw 503 with a different `error` body code so the client can tell them apart (`hostauth_unconfigured` vs `db_unavailable`)
- [ ] `src/routes/host.ts` — `dbError()` should include a structured `code` field on the response and log the error at `level: 'error'` with the route path (currently logs without the path so `db.error` lines are hard to attribute)
- [ ] `src/routes/host.ts` — `/staff` GET specifically: catch the error inline, log with `route: '/staff'` context, return 503 with code that surfaces the real failure mode in `process.env.NODE_ENV !== 'production'`
- [ ] `tests/unit/staffRouteErrors.test.ts` — failing-test-first: stub `listStaffAtLocation` to throw, assert response is 503 with the diagnostic code; assert log line includes route + detail

### Bug 2 — Wire up real email sending

- [ ] `src/services/mailer.ts` — new module. Single `sendEmail({ to, subject, body })` function. Uses `@azure/communication-email` if `ACS_EMAIL_CONNECTION_STRING` and `ACS_EMAIL_SENDER` env vars are set. Falls back to the existing `console.log` JSON line if either is missing. Never throws — mail failure must not break invite or signup.
- [ ] `package.json` — add `@azure/communication-email` dep
- [ ] `src/services/welcomeEmail.ts` — keep the existing `console.log` line (audit trail) AND call `sendEmail`
- [ ] `src/routes/host.ts:1170-1183` — same change for staff invite: log line + `sendEmail` with the magic link
- [ ] `tests/unit/mailer.test.ts` — covers (a) when env unset → log path returns ok, no SDK call; (b) when env set → SDK called with right args; (c) SDK throws → never propagates, logs error
- [ ] `tests/unit/staffInviteEmail.test.ts` — covers the invite handler calls `sendEmail` with the expected subject + body containing the link

## Validation requirements

- `uiValidationRequired`: false (server-side change; iOS UI gets clearer error from improved 503 body, but no new screens)
- `mobileValidationRequired`: false
- Manual validation via `curl` against the deployed Azure App Service to:
  - Reproduce the 503 (capture log line)
  - Verify the fix (200 returns staff list)
  - Verify ACS email sends (or log-only fallback) end-to-end with a real address

## Out of scope (deferred)

- HTML email templates beyond plain text
- DKIM/SPF DNS setup (operator task)
- Email retries / queue (single attempt in v1)

## Patterns leveraged

- **Stub-then-real env-gated mailer** matches the existing `console.log` pattern; keeps dev simple, prod-ready when env vars set
- **Azure Communication Services** matches the user's "Azure credits + simplicity" durable preference

## Open questions

None — the spec is concrete.

## Validation evidence

### Automated
- `npm run typecheck` (parent project) → clean
- `npx tsc --noEmit` (ios) → clean
- `npm test` (parent) → **675 / 675 pass** (gained 13: 7 for `dbError`, 6 for `mailer`)
- `npm test` (ios) → **50 / 50 pass** (gained 3 for `ApiError` diagnostic body parsing)
- Test-driven order honored: failing tests for `emitDbError` and `sendEmail` written before implementations existed; implementation flipped them green.

### Manual
- **Bug 1 (deployed /staff probe)**: deferred — requires owner session cookie against the Azure App Service which is operator-supplied. After this PR ships, the next /staff failure will return `{code, detail}` directly to the iOS client (visible in `ApiError.message`), making the diagnostic step trivial without log access.
- **Bug 2 (real ACS send)**: deferred — requires `ACS_EMAIL_CONNECTION_STRING` + `ACS_EMAIL_SENDER` to be provisioned in the deployed environment + `npm install @azure/communication-email` on the deploy. Until those exist, the mailer emits the existing `email.send` log line with `mode: 'log-only'` so behavior is identical to today (no regression).

### Rollout notes
- **Bug 1 fix is fully active immediately** when this branch ships — every existing `dbError` caller now returns the structured body and route-attributed log.
- **Bug 2 mailer is opt-in** — until ACS env vars exist, behavior is unchanged from today (log-only). When the operator provisions ACS:
  1. `npm install @azure/communication-email` on the deploy
  2. Set `ACS_EMAIL_CONNECTION_STRING` and `ACS_EMAIL_SENDER` env vars
  3. Restart — next staff invite or signup welcome will email for real
- No DB migration. No client-side native rebuild needed (iOS picks up the diagnostic-body change via EAS Update — server change is transparent to clients beyond what `ApiError.message` now contains).
