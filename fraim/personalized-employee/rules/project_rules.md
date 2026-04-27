# SKB Project Rules

Durable, repo-wide operating rules for any agent working in this repository.

**Project context**: SKB = Shri Krishna Bhavan, a South Indian restaurant in Bellevue, WA. This codebase exists to solve the restaurant's operations pain: long waiting lines, customers being rejected after long waits, and general front-of-house throughput. Every feature should be evaluated against: "does this reduce wait time, reduce rejections, or improve the customer's experience while waiting?"

## Branching & Git
1. **Primary branch is `master`**. Branch from `master`, PR back to `master`. Never use `main`.
2. **Small PRs tied to GitHub issues.** One issue → one PR. Include acceptance criteria in the issue body and link it from the PR.

## Stack & Code
3. **TypeScript strict mode everywhere.** No `any` unless justified with an inline comment explaining why.
4. **MongoDB is the system of record.** Do not introduce a secondary database (Postgres, Redis-as-primary-store, etc.) without explicit discussion.
5. **Mobile-first UI.** Every customer-facing screen must be usable on a phone in portrait orientation. Hosts and customers will primarily interact via phone.

## Safety
6. **Never commit secrets.** Use `.env.local` for local dev; document every required env var in `README.md`. Check `.gitignore` covers `.env*` before committing.

## Testing
7. **The critical waitlist path must stay green.** Any PR touching waitlist join, wait-time estimation, customer notification, or seating/no-show handling must include or update tests covering that flow before merge.

---

## Agent Operating Rules

These rules exist because the same class of mistake recurred too many times to be left to the agent's memory. Every rule below is the structural fix for a specific recurrence pattern in `fraim/personalized-employee/learnings/sid.mathur@gmail.com-mistake-patterns.md`. Agents working in this repo must comply — these are not advisory.

### Deploy gates

8. **Authenticated post-deploy smoke is mandatory.** A deploy is not "successful" until a script signs up a throwaway owner against the deployed environment, hits every endpoint with known-failure history (`/staff`, `/queue`, `/menu`, `/host/queue`), asserts the response is a success shape, and deletes the throwaway tenant. Anonymous probes (which return 401) do NOT satisfy this rule. The Azure deploy step's "success" status by itself does NOT satisfy this rule. **Implementation**: add this as the final step in `.github/workflows/deploy.yml` so the workflow fails when the smoke fails.

9. **Diagnostics ship before the fix when prod returns an opaque 5xx.** When a deployed endpoint returns a 5xx with a body that doesn't include the underlying error (e.g. `{"error":"temporarily unavailable"}`), the FIRST PR is diagnostic enrichment — always-on safe enums (`errorName`, `errorCode`, route attribution) plus an opt-in env var for full detail. The fix PR comes only after the diagnostic deploys and the actual error is visible.

10. **For client-reported 4xx, inspect the client URL/headers before touching the server.** Status codes name the layer that rejected the request, not necessarily the layer that caused it. A 4xx from a client means "read what the client is sending" first. Server-side speculative fixes are forbidden until that inspection is done and ruled out.

### Pre-commit data-discipline checks

11. **Any new `.find().sort()` query against a known-large collection requires a covering index.** Before opening a PR that adds such a query, either (a) run `db.collection.find(...).sort(...).explain('queryPlanner')` and confirm the winning plan has no SORT stage, or (b) add the supporting index to `bootstrapIndexes` in `src/core/db/mongo.ts`. **For Azure Cosmos DB / Mongo API specifically**, the sort field must be in an index AND the query must be hinted by index name — Cosmos's planner is non-deterministic across multiple matching indexes and may pick a plan with an in-memory SORT that Cosmos then rejects. See `fraim/ai-employee/skills/azure/cosmos-db-mongodb-setup.md`.

12. **Externally-checkable claims require a citation before they ship.** Product / brand / domain names require a namespace search artifact in the PR description. Pricing or volume figures require either the source link or an explicit `[estimate pending measurement]` marker. Vendor capability claims (e.g. "Twilio webhook X provides field Y", "ACS supports Z") require a documentation reference OR a captured payload in evidence. None of these may ship as bare assertions.

### PR shape

13. **One issue → one PR (no bundling).** Bug fixes for unrelated production failures get their own PR even when they're discovered while working on something else. Bundling extends review surface and destroys rollback granularity. Referenced from rule #2; this is the explicit no-bundling clarification.

14. **For any feature with a two-sided contract (admin saves → public renders), the PR must include an integration test that exercises BOTH sides** — admin saves data, then a fresh request to the consuming surface asserts the data appears. Half-features (admin works, public doesn't) are a recurring discovery in production bug bashes.

15. **One commit per bug fix during a bug bash.** Subject line scoped to the bug, regression test included, push immediately so the user can pull mid-bash. Don't batch multiple bug fixes into one commit unless they share an exact root cause.

### FRAIM workflow discipline

16. **`seekMentoring` is called at every phase boundary, with no phase-collapse and no hedge-stop.** When the mentor returns Phase N+1 instructions, execute them — do not print a "ready for review" summary and ask the user for explicit permission. Placeholder / `[owner confirm]` flags inside a draft are intended to be resolved in the PR review conversation; they do not block phase advance.

17. **Sub-agents receive the same `/fraim <job-name>` slash-command the user would give**, not custom step-by-step prompts. Custom prompts skip steps (most commonly PR creation) and break the FRAIM audit trail. Do not use `isolation: "worktree"` for sub-agents producing inspectable artifacts — auto-cleanup deletes them before review.

### Validation phase tripwires

18. **`/fraim ui-polish-validation` and `/fraim user-testing-and-bug-bash` refuse to run against design mocks or static HTML.** When invoked and the artifact it would validate doesn't exist as a runnable user-facing surface, the phase must surface the scope tension and stop, not fabricate a substitute target. Mocks describe intent; validation phases prove behavior; the two are not interchangeable.

19. **For any UI work, the validation pass must run Playwright at 375 / 768 / 1280 in BOTH light and dark mode** before declaring the phase done. Static regression tests do not substitute.

### Spec / RFC traceability

20. **Every RFC must include an explicit `## Requirement traceability` table mapping each `R<n>` from the spec to the section that addresses it.** The `design-completeness-review` phase fails if `grep -c "R[0-9]" rfc.md` is less than the count of R-tags in the source spec. This is how missed requirements (R6/R15/R19/R21 in #37; confirmation-SMS-on-join in #29) get caught before merge.

### Voice / IVR specifics

21. **No call recording, ever.** TwiML must not include `record="record-from-answer"` or any equivalent. Voice IVR flows use streaming STT only. (Owner policy.)

22. **Voice/IVR flows must (a) read back auto-detected data (Caller ID, DTMF) with confirmation; (b) not mirror web-form constraints — DTMF with `finishOnKey="#"` naturally supports multi-digit; (c) provide a human fallback (front-desk transfer) for edge cases the IVR can't handle; (d) cross-check every user-facing prompt noun against the TwiML — if the prompt says "after the beep," the TwiML must `<Play>` a beep.**

### Issue interpretation

23. **Read issue requirements literally.** When an issue says "users should specify X," X is required unless the issue explicitly says otherwise. Do not let existing code patterns (e.g., an optional field elsewhere in the codebase) override the literal reading of the issue. When a requirement contradicts a code pattern, the requirement wins — or, if the contradiction is load-bearing, flag it for the user before proceeding.
