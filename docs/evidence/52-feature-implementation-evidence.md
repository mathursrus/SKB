# Feature Implementation Evidence: Issue #52 — Location-scoped session cookie + requireRole middleware

Issue: [#52](https://github.com/mathursrus/SKB/issues/52)
Spec: [docs/feature-specs/51-fully-multi-tenant-system.md](../feature-specs/51-fully-multi-tenant-system.md) §8.4, §11.3
Branch: `feature/52-location-scoped-session-cookie` (off `feature/51-fully-multi-tenant-system`)
Work list: [52-implement-work-list.md](./52-implement-work-list.md)
Quality feedback: [52-feature-implementation-feedback.md](./52-feature-implementation-feedback.md) — one DRY finding, ADDRESSED.

## Traceability Matrix

| Requirement / Acceptance Criterion | Implemented File / Function | Proof (Test Name / Curl) | Status |
|---|---|---|---|
| **R1**: Cookie from /r/skb rejected (403) at /r/any-other/api/host/* | `src/middleware/hostAuth.ts` — `requireRole(...)` lid-vs-paramLoc check; `src/routes/host.ts` — `requireHost = requireRole('host')` on every protected endpoint | Integration `R1: cookie from A → GET /r/B/api/host/queue returns 403` (and 9 sibling tests covering /stats, /dining, /completed, /analytics, /settings, /voice-config, /visit-config, /site-config, POST /queue/add, GET /visit-qr.svg). Manual curl: `probe-a → /r/probe-b/api/host/queue → 403`. | Met |
| **R2**: Legacy-format cookie accepted for one window, logs `auth.legacy-cookie.accept` | `src/middleware/hostAuth.ts` — `verifyCookieDetailed` returns `{ ok: true, legacy: true }` on 2-segment cookies; `requireRole` emits the log | Integration `R2: legacy <exp>.<mac> cookie accepted at /r/skb/api/host/queue` + `R2: legacy cookie also accepted at a different tenant`. Server log captured: `{"level":"info","msg":"auth.legacy-cookie.accept","loc":"skb"}`. | Met |
| **R3**: `tests/integration/multi-tenancy.integration.test.ts` passes | New file `tests/integration/multi-tenancy.integration.test.ts` — 20 cases, all green | `Running 20 of 20 tests … ℹ pass 20 / ℹ fail 0`. Also wired into `package.json` `test:integration` script. | Met |
| **R4**: `npm run test:all` passes (no regressions) | N/A — regression verification | `npm test`: 51/51 unit pass. `npm run test:integration`: 204/204 pass across 13 suites (queue 23, board 8, queue-template 15, host-auth 26, multi-tenant 13, multi-tenancy 20, dynamic-eta 17, sms 11, waitlist-transparency 19, visit-route 13, dining-transitions 12, analytics 8, chat 19). voice(63) inside integration. Zero failures. `tsc --noEmit` clean. | Met |
| **R5**: PIN login on `/r/skb/host.html` unchanged; cookie now contains `lid=skb` | `src/routes/host.ts` — `mintLocationCookie(new Date(), key, loc(req))` on successful login | Integration `login at skb: cookie contains lid=skb (R5)`. Manual curl: `skb.1776532628.68a7efdf…` — first segment is `skb`. Existing `host-auth` integration still passes, confirming the login flow shape didn't change (status, body, Max-Age). | Met |
| Spec §8.4: cookie format `<lid>.<exp>.<mac>` where `mac=HMAC_SHA256(secret, '<lid>.<exp>')` | `src/middleware/hostAuth.ts` — `mintLocationCookie(now, key, lid)` | Unit `mintLocationCookie: produces <lid>.<exp>.<mac> with lid included in MAC input` re-derives the MAC and asserts equality. | Met |
| Spec §8.4: verifier accepts BOTH legacy and new format during deprecation window | `verifyCookieDetailed` dual-format branch | Unit `verifyCookie (legacy boolean API): still accepts both formats for backward compat`, unit `verifyCookieDetailed: legacy-format cookie returns { ok:true, lid:undefined, legacy:true }`, unit `verifyCookieDetailed: new-format cookie returns { ok:true, lid, legacy:false }`. | Met |
| Spec §8.4: `requireRole(role, ...)` replaces `requireHost`, extracts locationId, 403 on mismatch | `src/middleware/hostAuth.ts` — `requireRole(...roles)` factory | Unit `requireRole: new-format cookie with MISMATCHED lid → 403 wrong_tenant`, unit `requireRole: new-format cookie with matching lid → calls next(), sets req.hostAuth`. | Met |
| Spec §11.3: cross-tenant probe as compliance evidence | `tests/integration/multi-tenancy.integration.test.ts` | 20/20 cases pass; covers 10 distinct protected endpoints + positive control + tamper probe. | Met |
| Add `loc` field to `host.auth.fail` / `host.auth.ok` logs | `src/routes/host.ts` — both log lines include `loc: loc(req)` / `loc: lid` | Integration trace shows: `{"level":"info","msg":"host.auth.ok","loc":"skb","ip":"::1"}` and fail log with `loc`. | Met |
| Role enforcement in `requireRole(role, ...)` | Informational role param — cookie doesn't yet carry role claim. This is the documented deferral; role enforcement lands with the `skb_session` cookie in a later sub-issue (#51c/d). | Documented in work-list "Open Questions / Deferrals" and in the `requireRole` doc comment. | Partial (intentional) |

## Acceptance Criteria Verification

| AC | Test / Evidence | Status |
|---|---|---|
| R1 cross-tenant 403 | 10 integration tests + manual curl | Pass |
| R2 legacy cookie accepted with log | 2 integration tests + captured server log | Pass |
| R3 multi-tenancy test passes | 20/20 in new test file | Pass |
| R4 full suite passes | 255/255 across unit+integration | Pass |
| R5 skb login cookie contains lid=skb | Integration + curl | Pass |

## Deviations

| Deviation | Classification |
|---|---|
| Role parameter in `requireRole` is informational rather than enforced. | Intentional tradeoff — spec places role enforcement on the `skb_session` cookie (§8.4 bullet 1). This PR is the foundation; role enforcement is scoped to a later sub-issue. The signature is future-proof. |
| `requireHost` + `loginHandler` exports preserved. | Intentional — the existing unit test suite imports these symbols and the prompt calls this out as FOUNDATION (non-breaking). Production route handlers in `routes/host.ts` now use `requireRole('host')`. |
| Cookie `SameSite=Lax` (in route handler) vs `SameSite=Strict` (in legacy middleware's `loginHandler`). | Pre-existing divergence — not introduced by this PR. Left untouched to minimize blast radius. |

## Validation Artifacts

- **Unit**: `npx tsx tests/unit/hostAuth.test.ts` — 27/27 green. 10 new cases for v2 cookie + requireRole.
- **Integration (new)**: `npx tsx tests/integration/multi-tenancy.integration.test.ts` — 20/20 green.
- **Integration (regression)**: `tests/integration/host-auth.integration.test.ts` 26/26, `tests/integration/multi-tenant.integration.test.ts` 13/13. All pre-existing host-auth tests pass after the middleware swap.
- **Full regression**: `npm test` → 51/51, `npm run test:integration` → 204/204.
- **Build**: `npx tsc --noEmit` → no output (clean).
- **Manual curl**: Captured in `implement-validate` phase. R1 (403), R2 (legacy 200 + log), R5 (lid=skb) all confirmed.

## Feedback Verification

Quality feedback file [52-feature-implementation-feedback.md](./52-feature-implementation-feedback.md) contains 1 finding, marked ADDRESSED. Zero UNADDRESSED items.

## Validation Requirements Trace (from work list)

| Requirement | Required? | Executed? |
|---|---|---|
| `uiValidationRequired` | No (no UI touched) | N/A |
| `mobileValidationRequired` | No | N/A |
| Integration test for cross-tenant probe | Yes (R3, §11.3) | Yes — `multi-tenancy.integration.test.ts` |
| Curl/manual validation | Yes (diff touches auth) | Yes — captured under implement-validate |
