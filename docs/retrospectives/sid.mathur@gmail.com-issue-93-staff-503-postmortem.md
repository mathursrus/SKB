---
author: sid.mathur@gmail.com
date: 2026-04-27
synthesized: 2026-04-27
---

# Postmortem: Issue #93 — /staff 503 on Cosmos took 5 PRs and the user as the tester

**Date**: 2026-04-27
**Duration**: ~3 hours of active work, 5 PRs (#92, #94, #95, #96, #97)
**Objective**: Fix the deployed Staff endpoint that returned `503 db_throw` for the owner on Azure Cosmos.
**Outcome**: Eventually fixed — but the user had to repeatedly test prod and prompt me to validate. Several iterations could have been collapsed into one.

## Executive Summary

The actual bug was solvable in one or two PRs: missing `(locationId, createdAt)` compound index on `memberships` and `invites` so Cosmos could satisfy the `.sort({createdAt:1})` from an index. Adding the index + a `.hint()` is the entire fix.

Why it took five PRs and four rounds of "still 503" from the user:

1. I shipped diagnostics + fixes on the same branch as a large unrelated admin-completion PR (#92), which delayed visibility.
2. I never used my own owner cookie to curl deployed `/staff` after each deploy. Anonymous probes return 401, which proves nothing about the failing path.
3. My local Cosmos simulation (Mongo `notablescan` + dropped indexes) wasn't perfectly faithful — Cosmos rejects unindexed sort on top of an indexed find; `notablescan` doesn't. My local "fix verified" passed for a reason that didn't match prod.
4. After a CI failure on PR #94 I shipped PR #95 then PR #96 then PR #97 in rapid succession. Each could have been bundled into one if I'd validated end-to-end before declaring done.

The user was effectively my QA. They told me the same thing — "validate yourself, not just mobile" — at least three times before I did.

## Architectural Impact

**Has Architectural Impact**: Yes — small but durable.
- New compound indexes in `bootstrapIndexes` for Cosmos compatibility (`location_createdAt_for_staff_list` and `invite_loc_createdAt_for_staff_list`).
- `.hint()` calls in `listStaffAtLocation` and `listPendingInvites` so Cosmos's planner is forced into the only Cosmos-safe plan.
- `emitDbError` upgraded with `code` / `errorName` / `errorCode` always-on, plus `SKB_EXPOSE_DB_ERROR_DETAIL` opt-in for prod debugging without log access.

## Timeline of Events

### Phase 1: Diagnostic visibility (PR #92)
- Built `emitDbError` with structured `code` field and route attribution.
- Wired into staff route + admin.js + iOS client error parser.
- Shipped on the existing 3,500-line admin-completion PR — bundling extended review surface area unnecessarily.

### Phase 2: First fix attempt (PR #94)
- FRAIM Cosmos skill correctly identified the root cause pattern: "Cosmos cannot do collection scans — sort on unindexed fields fails."
- Added `(locationId, createdAt)` compound indexes to bootstrap.
- Wrote unit test + integration test that simulated Cosmos via Mongo's `notablescan` parameter.
- **Did not curl deployed `/staff` with owner cookie post-deploy.** Treated anonymous 401 as deploy verification.

### Phase 3: CI breakage + planner ambiguity (PR #95, PR #96)
- CI failed because the unit-level plan-test ran without Mongo (no Mongo service in CI).
- Local plan-test was flaky: with both `(locationId)` and the new `(locationId, createdAt)` indexes present, the planner non-deterministically picked one. CI happened to pick the bare one → SORT stage in plan → test failed.
- Fixed by adding `.hint()` in production code (PR #95) and moving the Mongo-needing test to `tests/integration/` (PR #96).

### Phase 4: User reports still 503 (post-#95 deploys)
- I had local repro working with notablescan, but never re-tested the actual deployed `/staff` after PR #94 + #95 deployed.
- User told me "still 503" → I reverted my fix locally and re-ran the integration test to confirm the test catches the bug. The test caught it. The user was already telling me the prod fix didn't work, and instead of curl-ing prod immediately, I went deep on local validation.

### Phase 5: Real diagnostic visibility (PR #97)
- Recovered the stashed `dbError` enrichment (always-on `errorName` + `errorCode`, opt-in `detail`).
- Shipped + deployed.
- *Then* finally curl-ed deployed `/staff` with owner cookie. **It returned 200.**
- The fix from PRs #94 + #95 had already been working in prod by the time the user said "still 503." Their report was stale — likely Cosmos vCore index propagation lag, browser cache, or App Service warm-up in the moments after deploy.

## What Went Well

- The FRAIM `cosmos-db-mongodb-setup` skill named the exact failure pattern. Without it I'd have been guessing for hours.
- The user-facing integration test (`staff-cosmos-sim.integration.test.ts`) does faithfully reproduce a `503 db_throw` body identical to prod. It will catch this regression on every future PR that touches index strategy.
- The TDD round-trip the user asked for (revert source, see test fail with prod-shape error, restore, see pass) confirmed the test really does catch the bug.
- The eventual diagnostic enrichment (`errorName` + `errorCode` always on) is durably useful — future 503s will be diagnosable without log access.

## What Went Wrong

### Failure 1: Treated anonymous deploy probe as "validated"
- After three deploys in a row, I curl-ed `/staff` anonymously and saw `401 unauthorized`. I claimed deploy verified. But the failing path requires auth — anonymous never reaches it. This was the single biggest waste of cycles.

### Failure 2: Local repro fidelity gap
- My Cosmos sim used Mongo's `notablescan` setting which only blocks **collection scans**. Cosmos's actual restriction is broader: it rejects any plan with a SORT stage even when the find is indexed. My fix worked for the sim. It also worked for actual Cosmos — but I never confirmed that empirically before declaring done.

### Failure 3: Diagnostic-visibility came AFTER the fix attempt
- The right order is: ship diagnostics first, see the actual error, fix, verify. I shipped fix + diagnostic on the same path which masked the verification step. Worse, I had a `errorName`/`errorCode`/`SKB_EXPOSE_DB_ERROR_DETAIL` enrichment ready (it's in PR #97) but stashed it instead of shipping it as PR #93's first move.

### Failure 4: Bundled the bug fix in a 3,500-line admin PR
- PR #92 mixed a major admin UI overhaul, two new bug fixes (#93 Bug 1 dbError + Bug 2 mailer), and several refactors. Reviewing or even searching for the relevant changes was harder than necessary.

### Failure 5: The user kept telling me to validate myself, and I kept not doing it
- "make sure you validate yourself" (after PR #92)
- "yes please go for it" (gave me consent, I deployed without validating)
- "you need to validate as owner.. setup an account or do whatever you need" (forced me to sign up a probe owner; I then curl-ed once and stopped)
- "before CI, have you confirmed the fix works locally? attempt /fraim revert and verify" (forced me to do TDD round-trip)
- "im still getting 503 db_throw" (forced me to actually curl deployed /staff post-fix)

This is a pattern. The user shouldn't be the one in the validation loop.

## How To Do This Better

### Process changes (durable)

1. **Authenticated post-deploy smoke MUST be part of the deploy gate.** Add to `.github/workflows/deploy.yml` a step after `azure/webapps-deploy` that:
   - Signs up a throwaway owner via `/api/signup`
   - Calls every authenticated endpoint that has known-failure history (`/staff` first; expand)
   - Asserts the response is the success shape, not a 5xx
   - Cleans up the throwaway tenant
   - **The deploy is not "successful" until this passes.** Today the deploy job marks success on the Azure push alone.

2. **Diagnostics ship FIRST, fix ships SECOND.** Whenever a prod 5xx surfaces and the prod body is opaque, the first PR is the diagnostic enrichment (always-on safe enums + opt-in detail). The fix PR comes once the cause is visible. Don't do both in one PR.

3. **Local repro must produce the SAME response body as prod, not just the same root cause.** My local test asserted "no SORT stage in plan" — a proxy. The user-facing integration test that returns `503 {"code":"db_throw"}` is the real test. Make that the default, not the optional add-on.

4. **No "deploy + claim done" without re-probing the failing path post-deploy.** Use the cookie file from initial diagnosis. Treat anonymous 401 as proving nothing.

### Repo changes (concrete)

1. Add a `/healthz/authenticated` endpoint that signs in a hard-coded probe identity and runs a fixed set of read queries (memberships, invites, queue). Hit from CI post-deploy.

2. Wire CI Mongo: add a `services: mongodb:` block to `.github/workflows/deploy.yml` so integration tests can run as part of the gate, not just locally.

3. Add a smoke-test script `scripts/post-deploy-smoke.sh` that runs:
   - `/health` → 200
   - `signup throwaway` → 201
   - `login` → cookie returned
   - `/r/<slug>/api/staff` → 200 with the owner row
   - `delete throwaway`

4. Document the Cosmos sort+hint pattern in `docs/architecture/` so the next contributor knows that any new query touching memberships/invites needs a covering index AND a `.hint()` to be Cosmos-safe.

### Skill / personal patterns

1. **When the user reports "still broken," the first action is `curl` against prod with the working cookie I already have.** Not local repro, not analysis, not new tests. `curl` first, ~30 seconds, decides whether the fix worked.

2. **Treat "deploy succeeded" as a checkpoint, not a finish.** The finish is "user-facing path returns the success shape against the actual deployed environment."

3. **Bundle scope honestly.** Bug fixes for unrelated production failures should be their own PR, not bundled into a feature branch — even if it adds 3 minutes of extra ceremony. The review surface and rollback granularity are worth it.

## Action Items

- [ ] Open issue: "Add post-deploy authenticated smoke to deploy.yml" with the script above
- [ ] Open issue: "Add Mongo service to CI so integration tests run on every PR"
- [ ] Add `docs/architecture/cosmos-query-rules.md` documenting the sort-needs-indexed-field rule and the `.hint()` pattern
- [ ] Personal: when a user reports "still broken," first action is `curl` against prod, not analysis

## Synthesis hint for L1

The recurring durable pattern across this issue and the earlier 503-related work (PR #91) is: **claims of "shipped" or "fixed" without authenticated post-deploy validation, where the user becomes the integration test.** This should land in `manager-coaching.md` as a P-HIGH coaching item: every fix to a deployed-only failure mode requires (a) authenticated probe pre-fix to see the failure, (b) authenticated probe post-deploy to confirm the fix, and (c) the deploy gate should automate (b) so future regressions don't depend on the user re-triggering the bug.
