---
quality:
  composite: 8.0
  standards_compliance: 8
  coverage_depth: 7
  test_integrity: 9
  scenario_robustness: 8
  coaching: "Add tests/unit/smsVendor.test.ts that mocks fetch to verify Twilio response mapping (error codes 30034 / 21608 / timeout / network) in src/services/sms.ts. That single file closes the biggest remaining gap — the real production SMS path — and would lift statement coverage from 58% toward 68% without requiring new integration infra."
generated_at: 2026-04-16
job: test-quality-assessment
issue: 50
---

# SKB — Test Quality Report

- **Date**: 2026-04-16
- **Scope**: server test suite (`tests/unit/**`, `tests/integration/**`), iOS jest tests
- **Preceding work**: shipment of TFV compliance fixes (30509, 30513), host Add-party endpoint, iOS host parity (Complete tab, Custom SMS/Call, settings lock, Add-party sheet, icons)

## Executive Summary

**307 tests pass, 0 fail**, deterministic, fast (~17s combined). Branch coverage is **85.66%** — the strong signal that matters most, since it exercises the 400/401/409 error paths that protect invariants. Statement coverage (58.15%) is pulled down by the Twilio SMS client, push-notifications bridge, and backward-compat middleware — all exercised via `prod-validation/*.prod.test.ts` against the live Twilio/Azure surfaces.

The 31-file suite adheres to the `BaseTestCase + runTests` standard with **1 exception** (voice.integration.test.ts, a self-described "quick debug" standalone runner).

## Standards Compliance

| Check | Pass | Notes |
| --- | --- | --- |
| `tests/unit/*.test.ts` naming | ✅ 20/20 | — |
| `tests/integration/*.integration.test.ts` naming | ✅ 11/11 | — |
| Imports `BaseTestCase` from `tests/test-utils.ts` | 15/31 files | Remaining files use `runTests(cases, ...)` with inline `BaseTestCase[]` typing — functionally equivalent |
| Uses `runTests` helper | 30/31 | `voice.integration.test.ts` is the outlier |
| Integration tests use `tests/shared-server-utils.ts` | ✅ 10/11 | `voice.integration.test.ts` spawns its own Express app without the shared helper — worth normalizing in a later cleanup pass |
| No inline mock/fixture duplication | ✅ | Shared `resetDb()` pattern, shared `tests/shared-server-utils.ts`, shared `tests/prod-test-utils.ts` for prod probes |

## Coverage Summary

Unit-only run (`npx c8 --reporter=text-summary -- npx tsx --test tests/unit/*.test.ts`):

```
Statements   : 58.15% ( 1694 / 2913 )
Branches     : 85.66% (  508 /  593 )
Functions    : 64.91% (  222 /  342 )
Lines        : 58.15% ( 1694 / 2913 )
```

Integration-inclusive run exercises more of `src/services/queue.ts`, `src/services/dining.ts`, `src/routes/host.ts`, `src/routes/queue.ts`, and `src/mcp-server.ts` — expected real number across the full suite is ≈ 75% lines / ≈ 90% branches (based on file-by-file inspection of which branches are hit by each integration test).

## Coverage Strengths

- **Waitlist happy path** (join → call → seated → advance through ordered/served/checkout/departed) is fully exercised across `queue.integration.test.ts`, `dining-transitions.integration.test.ts`, and `waitlist-transparency.integration.test.ts`.
- **Host auth** — PIN login, cookie issuance, tampering detection, logout, expiration, 401-on-protected-routes all tested in `host-auth.integration.test.ts`.
- **Rate limiting** — dedicated unit tests per limiter (`rateLimit.test.ts`).
- **SMS templates** — every body has a golden-string unit test (`smsTemplates.test.ts`).
- **JSON-LD / schema.org** — 11 targeted tests covering Restaurant, PostalAddress, OpeningHoursSpecification serialization.
- **TFV 30513 SMS consent** (new this round): 3 service-layer tests on `joinQueue` + `callParty`, 2 HTTP-route tests for `/queue/join` propagating the flag, and 4 `bug50Regression` guards asserting the checkbox is unchecked by default, the reassurance note is present, STOP/HELP keywords render, and `queue.js` actually sends the flag.
- **Host /queue/add** (new this round): 5 HTTP-route tests covering requireHost gating, valid add, HTML-metachar rejection, bad phone, bad party size — plus 3 `bug50Regression` guards on the UI shape and server route signature.
- **iOS surface** (new this round): 9 structural `bug50Regression` guards assert each recent feature survives a refactor — absence of manual cookieJar, presence of `/api` in `buildUrl`, Complete tab files, AddPartySheet/CustomSmsDialog/CustomCallDialog components, settings ETA lock, chat drawer close button + SafeAreaView, keyboard-avoidance, Ionicons tab icons.

## Coverage Gaps

Each prioritized by risk × recurrence.

### P1 — Worth filling

1. **Twilio `sendSms` response parsing** (`src/services/sms.ts`). Unit coverage on the wrapper is indirect — tests assert that `smsConsent=false` produces `'not_configured'` status, but no test exercises the actual Twilio HTTP response parsing (error codes 30034, 21408, etc. that the service maps to `'failed'` / `'not_configured'`). Mitigated by `prod-validation/twilio-status.prod.test.ts` but that requires prod creds.
   - **Recommended test**: `sms.test.ts` with a mocked `fetch` returning canned Twilio responses (200 with `status: 'queued'`, 400 with `code: 21608`, 400 with `code: 30034`) and asserting the mapping.

2. **Host rewrite middleware** (`src/mcp-server.ts:55`). Only 1 multi-tenant integration case. Gaps:
   - Request arrives with unknown Host header → passes through unchanged
   - URL already starts with `/r/` → skipped
   - Cache entry expires after 60s → re-queries DB
   - **Recommended test**: extend `multi-tenant.integration.test.ts` with 3 cases.

3. **Chat thread persistence when SMS is skipped**. The `sendChatMessage` behavior "skip SMS leg but still store the outbound message in the thread" is a compliance-relevant invariant: hosts should see their own message even when the diner didn't opt in. Indirectly covered but not asserted.
   - **Recommended test**: unit on `src/services/chat.ts` with an in-memory DB asserting that for a non-consenting entry, `getChatThread(id)` contains the outbound message after `sendChatMessage(id, body)` with `smsStatus === 'not_configured'`.

### P2 — Nice to add

4. **Voice IVR branches** — `voice.integration.test.ts` is the quick-debug runner; real IVR press-0/press-1/press-4 branches have no structured coverage. Rebuild this file to use `runTests` + `shared-server-utils` and add one case per branch.

5. **iOS component behavior** — structural guards in `bug50Regression.test.ts` catch file-deletion and regex-level regressions, but no runtime assertions on `<AddPartySheet onClose={...} />` or `<SeatDialog conflict={...} />`. React Native Testing Library is not yet set up for the iOS project.
   - **Recommended**: add `@testing-library/react-native` + 5 behavioral tests for AddPartySheet (submit disabled until valid, error message on 400, success dismisses and polls).

### P3 — Polish

6. **Prod-validation scripts** (`prod-validation/*.prod.test.ts`) aren't part of `npm test`. Worth wiring an `npm run test:prod` alias that runs them behind an env gate so `test:prod` is a one-command reality check.

## Test Suite Health

| Metric | Value |
| --- | --- |
| Total tests | 307 |
| Pass | 307 |
| Fail | 0 |
| Flaky | 0 observed across 4+ runs this session |
| Unit suite duration | ~2.4s |
| Integration suite duration | ~15s (MongoDB-backed) |
| Deterministic | ✅ — MongoDB seeded per-test via `resetDb()`; no time-of-day dependencies |

## Final Decision

**Pass with noted follow-ups.** The suite is in healthy shape: 86% branch coverage, zero flakes, clear separation between unit / integration / prod-validation layers, and consistent use of shared utilities. The P1 gaps (Twilio response parsing, multi-tenant middleware edges, chat-when-no-SMS) are worth a focused half-day but don't block the current release.
