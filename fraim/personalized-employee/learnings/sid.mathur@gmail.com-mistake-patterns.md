# Mistake Patterns — sid.mathur@gmail.com

Durable record of recurring agent mistakes that have been observed and must be avoided in future work. Entries below are confirmed and active guidance.

**Last synthesized**: 2026-04-27 (full corpus debrief: all 13 retros + 6 raw L0 signals)

---

## Confirmed entries

### [P-HIGH] Evidence-based reasoning required — and authenticated post-deploy validation is the deploy gate

**Score**: 22.0
**Last seen**: 2026-04-27
**Recurrences**: 7
**First synthesized**: 2026-04-12 — bumped 2026-04-27 from 5 new recurrences

Before changing code that depends on an external system (Twilio, Stripe, OAuth, LLM API, production data) OR before writing a precise load-bearing number in a strategy document, gather LIVE evidence and cite its source.

**For any work that ships to a deployed environment, "live evidence" must include an authenticated probe against the deployed environment AFTER the deploy completes** — anonymous probes that return 401 prove nothing about the failing path. Use the `curl -b <cookie>` round trip as the deploy gate, not the Azure deploy step's "success" status.

Live evidence means production logs, real telemetry pulls, captured request/response traces, or actual data from the source of record. Passing tests that mock the external system do NOT verify such a fix — and a passing local repro that simulates the failure mode imperfectly (Mongo `notablescan` ≠ Cosmos's actual planner restriction) is also not a substitute. Precise-looking numbers must either show their derivation OR be explicitly labeled as placeholder estimates that block downstream decisions until real data arrives. External-fact claims (product names, pricing, integration field names, vendor capabilities) require the same standard — propose only after the namespace / pricing / payload check is done and cited.

**This is the dominant systemic discipline gap.** Recurrences span 2026-04-08 through 2026-04-27:
- 2026-04-08 issue-#29 tech-design — assumed Azure credits cover phone purchases
- 2026-04-10 business-plan — fabricated "600 SMS/month" COGS, 10x undercount
- 2026-04-13 unindexed-query — shipped query without explain-plan check; SKB Bellevue 503'd 15 min
- 2026-04-17 product-name "Mise" — proposed without namespace search; 6 collisions
- 2026-04-24 mock-instead-of-real-UI — ran ui-polish against design mock; fabricated evidence
- 2026-04-25 Twilio webhook fields — RFC built without payload validation
- 2026-04-27 issue-#93 — shipped /staff fix across 4 PRs without authenticated post-deploy probe

The structural fix is automated (see `fraim/personalized-employee/rules/project_rules.md` agent operating rules §Deploy gates and §Pre-commit data-discipline checks).

---

### [P-HIGH] Parallel sub-agents must use FRAIM job commands, not custom step-by-step prompts

**Score**: 16.0
**Last seen**: 2026-04-06
**Recurrences**: 3
**First synthesized**: 2026-04-12

When delegating work to sub-agents via the Agent tool, the prompt must be the same `/fraim <job-name>` slash-command the user would give — not a custom free-form prompt with step-by-step instructions. Sub-agents have the same `CLAUDE.md`, same MCP tools, and same FRAIM discovery as the orchestrator, so they will correctly call `fraim_connect`, `get_fraim_job`, `seekMentoring`, and reach the submission phase (including PR creation) on their own. Custom prompts produce worse results: they inevitably skip steps (most commonly PR creation and FRAIM session tracking), the work is invisible on GitHub, and there is no FRAIM audit trail. After sub-agents return, the orchestrator must still call `seekMentoring` once per issue in the main thread to register completion in the FRAIM session. Do not use `isolation: "worktree"` for sub-agents producing inspectable artifacts (mocks, specs, evidence) — the auto-cleanup will delete the local copies before the user can review them.

---

### [P-HIGH] seekMentoring at every phase boundary — no phase collapse, no hedge-stop

**Score**: 12.7
**Last seen**: 2026-04-15
**Recurrences**: 3
**First synthesized**: 2026-04-12 — extended 2026-04-27 with the issue-#45 hedge-stop variant

For any FRAIM phased job, `seekMentoring` must be called with `status: "complete"` at every phase transition — even when the agent feels confident the phase is straightforward or has been effectively completed already. Collapsing phases into a single output loses the mentoring guidance for the skipped phases (which may contain skills, quality gates, and guardrails the agent would otherwise miss), breaks the FRAIM audit trail, and produces no record of phase-complete decisions.

**Equally bad is the inverse — hedge-stop**: when the mentor returns Phase N+1 instructions, execute them. Don't print a "ready for review" summary and ask the user for explicit permission to proceed. Placeholder/`[owner confirm]` flags inside a draft belong in the PR review conversation, not in a pre-submission checklist that blocks phase advance. The `feedback_fraim_autonomous_cadence` preference's "pause at commit time" means "pause to surface errata after shipping," not "pause to re-confirm before each phase."

Recurrences:
- 2026-04-06 codebase-brainstorming — phases 2–5 collapsed into one output
- 2026-04-06 sub-agent dispatch — skipped completion mentoring
- 2026-04-15 issue-#45 — hedge-stop at Phase 5; user had to issue `/fraim follow-your-mentor`

---

### [P-HIGH] Different vendor API surface = new spike, even if the same SDK is familiar

**Score**: 10.0
**Last seen**: 2026-04-25
**Recurrences**: 3
**First synthesized**: 2026-04-12 — bumped 2026-04-27 from 2 new recurrences

Familiarity with one of a vendor's APIs does not transfer to another surface from the same vendor. Twilio SMS experience does not transfer to Twilio Voice TwiML (different XML schema, silent-failure modes on invalid nesting/attributes, different error channel). Familiarity with Twilio doesn't extend to Twilio webhook payload contracts (different event surface, different field set per event type). Before claiming "no spike needed" for an unfamiliar surface, inventory:
- (a) is the request/response shape different from what you've seen?
- (b) are failure modes observable through normal HTTP status codes, or do errors manifest as silent behavior?
- (c) can you test through the actual vendor (e.g., via ngrok + curl) before asking the user to trigger it?
- (d) for webhook-driven designs, has the actual provider payload been captured against the documented schema, or are we trusting docs alone?

If any answer is "I'm not sure," spike first.

Recurrences:
- 2026-04-08 issue-#29 — assumed ACS phone purchase without spiking subscription eligibility
- 2026-04-09 issue-#31 — Twilio Voice TwiML (initially "no spike needed"); 11 findings caught later
- 2026-04-25 issue-#83 — RFC built before validating Twilio Voice/Gather webhook payload schema

---

### [P-MED] For client-reported 4xx, read the client URL/headers before touching the server

**Score**: 5.0
**Last seen**: 2026-04-15
**Recurrences**: 1
**First synthesized**: 2026-04-27

User reported "iOS 404 on PIN 1234." First fix attempt: speculatively changed `SameSite=Strict` → `SameSite=Lax` cookie attribute and shipped. Real bug: the iOS client was building `/r/:loc/host/login` but server mounts the host API at `/r/:loc/api/host/*`. Missing `/api`. One `grep -rn buildUrl ios/` would have found it on the first pass.

**Heuristic**: when the user sees a 4xx, the first action is to inspect the *exact path the client is sending* (and the headers), not to hypothesize about auth/cors/cookies. Status codes point at the layer that rejected the request, not necessarily the layer that caused it. Speculative server-side fixes burn deploy cycles and pollute `git blame` for the actual root cause.

---

### [P-MED] A validation phase requires the artifact to exist as a runnable surface — don't fabricate a substitute target

**Score**: 5.0
**Last seen**: 2026-04-24
**Recurrences**: 1
**First synthesized**: 2026-04-27

When `/fraim ui polish` was invoked on PR #70 (issue #69, multi-tenant SMS), the actual feature was a backend-only walking skeleton — the admin Settings → Messaging page was deferred. Instead of stopping and surfacing the scope tension, I ran the polish workflow against the static HTML design mock at `docs/feature-specs/mocks/69-admin-sms-settings.html`. The 150-line evidence doc + five screenshots + "no P0 defects" signoff falsely implied the real feature had been exercised.

**The rule**: when a validation phase (`ui-polish-validation`, `user-testing-and-bug-bash`, security review) is invoked and the artifact it would validate doesn't exist as a runnable user-facing surface, stop and surface the scope tension. Don't substitute a design mock to keep motion. Mocks describe intent; validation phases prove behavior; the two are not interchangeable. Deferred scope items from an earlier phase should be tagged as blocking tripwires for the downstream phases that depend on them.

---

### [P-MED] When user reports "still broken" post-deploy, first action is `curl` against prod with the working cookie

**Score**: 5.0
**Last seen**: 2026-04-27
**Recurrences**: 1
**First synthesized**: 2026-04-27

After PRs #94+#95 deployed for issue #93, the user reported "still 503." My response was to revert source locally and run a TDD round-trip to confirm my test caught the bug. The user was already telling me prod was broken; the right first action was a 30-second `curl -b /tmp/owner_cookie.txt …/staff` to confirm whether prod was actually still failing (it might already have been fixed — Cosmos vCore index propagation lag, browser cache).

**Decision tree**: when the user reports "still broken" after a deploy I just shipped:
1. `curl` the deployed failing path with the auth I already have. ~30 seconds.
2. If still failing, look at the body for new diagnostic info (errorName/errorCode/detail).
3. If now working, the user's report was stale — next action is helping them invalidate cache or wait for index propagation.

Either way, the answer is in the response, not in another local repro.

---

### [P-MED] Bundled unrelated changes into one large PR

**Score**: 5.0
**Last seen**: 2026-04-27
**Recurrences**: 2
**First synthesized**: 2026-04-27

PR #92 mixed a major admin UI overhaul, two new bug fixes (#93 dbError + mailer), and several refactors (3,500 lines). Reviewing or even searching for the relevant changes was harder than necessary, and rollback granularity was zero — reverting the bug fix would have reverted the admin overhaul.

**The rule**: bug fixes for unrelated production failures should be their own PR, not bundled into a feature branch — even if it adds 3 minutes of extra ceremony. The review surface and rollback granularity are worth it. The project rule "Small PRs tied to GitHub issues. One issue → one PR" already says this; the discipline gap is following it under time pressure.

---

### [P-MED] Knowledge-without-application: a freshly-promoted L1 entry doesn't prevent the same mistake hours later

**Score**: 5.0
**Last seen**: 2026-04-13
**Recurrences**: 2
**First synthesized**: 2026-04-27

Two L1 entries about evidence-based discipline were synthesized and promoted on 2026-04-12. Less than 2 hours later (2026-04-13), commit `c39842d` shipped the unindexed-query bug — the exact failure mode both entries described. Same pattern earlier on 2026-04-10 with the COGS coaching moment.

**The implication**: knowing the rule is not the same as applying it. Soft "remember to..." reminders in L1 do not consistently fire under time pressure or context-switch load. The reliable fix is to convert L1 mistake-patterns into either (a) deterministic project-rule checks the agent literally cannot bypass, or (b) pre-commit/pre-deploy automated gates. See `project_rules.md` agent operating rules.

---

### [P-MED] Spec sections must be cross-checked against issue requirements via traceability matrix, not vibe

**Score**: 5.0
**Last seen**: 2026-04-13
**Recurrences**: 2
**First synthesized**: 2026-04-27

First-pass RFCs translate spec sections section-by-section, which silently drops requirements that don't fit the section structure. Issue #37: missed R6, R15, R19, R21 in initial RFC; only the explicit traceability matrix caught them. Issue #29: missed the confirmation-SMS-on-join requirement.

**The rule**: every RFC must include an explicit `## Requirement traceability` table mapping each `R<n>` from the spec to the section that addresses it. The `design-completeness-review` phase should fail if `grep -c "R[0-9]" rfc.md` is less than the count of R-tags in the spec.

---

### [P-MED] Read issue requirements literally; don't mirror existing code patterns that contradict them

**Score**: 5.0
**Last seen**: 2026-04-09
**Recurrences**: 3
**First synthesized**: 2026-04-12 — bumped 2026-04-27 from 2 new recurrences

When an issue says "users should specify X," X is required unless the issue explicitly says otherwise. Do not let existing code patterns (e.g., an optional field elsewhere in the codebase) override the literal reading of the issue. When a requirement contradicts a code pattern, the requirement wins — or, if the contradiction is load-bearing, flag it for the user before proceeding.

Recurrences:
- 2026-04-08 issue-#29 — defaulted phone to "optional" because existing `phoneLast4` was optional
- 2026-04-09 issue-#31 — capped party size at 1-9 because web form caps at 10 (voice DTMF naturally supports multi-digit)
- 2026-04-09 issue-#31 — rejected blocked Caller ID because the web flow assumes phone is known

---

### [P-MED] Two-sided contract: an admin "save" without a public "render" is a half-feature

**Score**: 5.0
**Last seen**: 2026-04-19
**Recurrences**: 1
**First synthesized**: 2026-04-27

Issue #51 prod-bugbash: the Menu Builder admin saves worked end-to-end; the public `/menu` page still showed "Menu coming soon." Both halves of any data-flow feature must be exercised before declaring done.

**The rule**: any admin-side change producing data consumed by a public page (or any other downstream consumer) must include an integration test that exercises BOTH sides — admin saves, then the consuming surface loads and asserts the data appears. See `project_rules.md` for the deterministic check.

---

### [P-MED] Voice/IVR UX requires caller confirmation loops and a human fallback — do not mirror web form constraints to voice

**Score**: 8.0
**Last seen**: 2026-04-09
**Recurrences**: 4
**First synthesized**: 2026-04-12 — bumped 2026-04-27 (issue-#31 had 4 distinct misses, all the same root cause)

When designing a voice/IVR flow:
- (a) read back any auto-detected data (Caller ID, DTMF-parsed numbers) and offer the caller a chance to verify or use an alternative; the caller cannot see what the system captured.
- (b) Do not mirror web-form constraints to voice — DTMF with `finishOnKey="#"` supports multi-digit entry naturally, so there is no reason to cap party size at a single digit.
- (c) Always provide a human fallback for edge cases the IVR cannot handle (e.g., large parties, blocked Caller ID) — transfer to the front desk rather than hanging up.
- (d) Cross-check every noun in the user-facing prompt against the TwiML: if the prompt says "after the beep," the TwiML must `<Play>` a beep.
- (e) The owner's policy is **no call recording** — never include `record="record-from-answer"` or similar in TwiML.

---

### [P-MED] Mocks must show the user journey on the external platform, not the implementation details

**Score**: 5.0
**Last seen**: 2026-04-09
**Recurrences**: 1
**First synthesized**: 2026-04-12

For any feature spec that involves an external platform (Google Maps, WhatsApp, Stripe checkout, a POS system), the mock must show what the USER sees on that platform — not what the code emits. Annotated HTML `<head>` tags, JSON-LD, or server-side rendering outputs are developer-facing, not stakeholder-facing. During completeness review, apply the test: "would a non-technical reviewer understand what this feature looks like without reading the code?" If the answer is no, the mock is at the wrong abstraction level.

---

### [P-MED] Verify the audience direction of a structured file before writing to it

**Score**: 5.0
**Last seen**: 2026-04-12
**Recurrences**: 1
**First synthesized**: 2026-04-12

When writing to a structured file that is part of a learning system, template, or documentation schema (FRAIM L1 files, evidence templates, retrospective templates, spec templates), read the file's semantic direction before writing. Specifically ask:
- (a) who is the AUDIENCE of this file — the agent, the user, or a reviewer?
- (b) what DIRECTION is the content flowing — is the agent writing memory for itself, or writing advice for someone else?
- (c) does the FILE HEADER or a template comment tell me the expected framing (first-person notes to self, second-person coaching, third-person reference)?

Getting this wrong once will contaminate the file with content pointing in the wrong direction, which the user must then correct. Example failure mode: wrote `manager-coaching.md` as "agent-memory about user instructions" in first-synthesis 2026-04-12, when the correct framing is "agent-written notes for the user about how to prompt better." Fix: before writing any structured learning/template file, explicitly state to self what the audience and direction are, and verify against the file header or parent template.

---

### [P-MED] Feature branch push is not the deliverable — the PR is

**Score**: 5.0
**Last seen**: 2026-04-06
**Recurrences**: 1
**First synthesized**: 2026-04-12

Pushing a feature branch to `origin` without creating a PR means the work is invisible on GitHub — there is no review surface, no CI status, no link from the issue. The deliverable is the PR, not the branch. Every submission-phase completion summary must explicitly verify: (1) branch pushed, (2) PR created, (3) PR linked to the issue. When delegating to sub-agents, include PR creation in the sub-agent's mandate unless the user has explicitly deferred it.
