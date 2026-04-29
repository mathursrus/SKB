# Manager Coaching — sid.mathur@gmail.com

Things you (the user) can do differently when prompting the agent to get better outcomes. **Strictly user-actionable prompting changes.** Generic observations about your behavior or systemic agent fixes belong elsewhere — agent failures go in `mistake-patterns.md`, structural fixes go in `rules/project_rules.md`.

**Last synthesized**: 2026-04-28 (issue-102 added one new prompt-change pattern)

---

## Confirmed entries

### [P-MED] Push back on at least one bold pick when stakes are high

**Score**: 5.0
**Last seen**: 2026-04-10
**Recurrences**: 1
**First synthesized**: 2026-04-12

Observed pattern from the 2026-04-10 Frontline business-plan session: you said "be bold" as your kickoff framing, the agent responded with 8 opinionated defaults across founder posture / capital / ICP / pricing / brand / outcome, and you approved all 8 with "love it... you nailed all." Zero overrides. That is fine for low-stakes work, but the 2026-04-10 session locked founder-level commitments (when to go full-time, pre-seed target, ICP tip-of-the-spear, rebrand decision).

**Prompt change**: for high-stakes decision sets, force a rule on yourself — push back on exactly one bold pick per session, even if you secretly agree with all of them. The act of disagreeing on one forces the agent to re-examine its reasoning on the adjacent picks, which is where hidden assumptions live. If the agent's defense of the disputed pick is weak, the adjacent picks deserve a second look too.

---

### [P-MED] Open every cross-domain context switch with a 2-sentence grounding prompt

**Score**: 5.0
**Last seen**: 2026-04-12
**Recurrences**: 1
**First synthesized**: 2026-04-12

In a single session you routinely move through: GBP setup → business plan → PDF authoring → Twilio unit economics → competitor pricing → feature impl → bug fix → end-of-day debrief. Six-plus distinct context domains with significant re-grounding between each. You handle it fine — your intuition carries across domains and you can re-enter a context quickly. The agent has to re-read files, re-validate assumptions, and re-establish patterns each time, which costs tokens and introduces drift risk (the fabricated COGS error happened at exactly this kind of strategic-to-tactical handoff).

**Prompt change**: when you switch contexts mid-session, open the new context with a two-sentence grounding prompt — "we're switching from X to Y; the current state is A; the goal is B" — instead of letting the agent infer the pivot from a one-line cue. Cheap, captures most of the benefit of dedicated batched sessions without requiring scheduling discipline.

---

### [P-MED] When delegating into a context with a broken empirical loop, add an explicit validation constraint

**Score**: 5.0
**Last seen**: 2026-04-27
**Recurrences**: 1
**First synthesized**: 2026-04-27

Pattern from issue #93: when you delegate a simple-loop task ("set up TestFlight," "open this URL and click through"), the agent has clear empirical signals — HTTP responses, browser DOM, file outputs — and the delegation works well. When you delegate a task where the empirical loop has a gap (deployed environment we can't directly observe, third-party API behavior, hardware device, real user account), the agent fills the gap with local proxies (notablescan ≈ Cosmos, mocks ≈ real UI, anonymous probe ≈ authenticated probe) that look like validation but aren't. Your "you do everything" delegation in those cases ends with you running the integration test (because the agent didn't).

**Prompt change**: when delegating into a context with a broken empirical loop, add an explicit constraint to the delegation: *"...and validate against the actual <X> before declaring done"* where `<X>` is the deployed environment, the real third-party endpoint, the live device, etc. Without the explicit constraint, the agent's defaults are too soft.

There's a structural fix in flight too (project rule #8 — authenticated post-deploy smoke as deploy gate); once that lands, this prompt change becomes a belt-and-suspenders rather than the primary defense.

---

### [P-MED] When invoking a validation phase, name the target environment + the runnable surface explicitly

**Score**: 5.0
**Last seen**: 2026-04-19
**Recurrences**: 2
**First synthesized**: 2026-04-27

Two recurrences where ambiguous validation-phase prompts let the agent pick the wrong target:
- 2026-04-19 issue-#51 prod-bugbash — agent assumed validation against PR-merge state; production was a different DB, so demo@osh.test wasn't there.
- 2026-04-24 issue-#69 ui-polish — agent ran polish against a static HTML mock because the real admin page wasn't built yet.

**Prompt change**: when invoking `/fraim ui polish` or `/fraim bug bash` or similar, name the target explicitly. Examples:
- "validate against `https://skb-waitlist.azurewebsites.net` using a fresh tenant signup"
- "validate against the live admin page; if the page doesn't exist yet, stop and tell me"

There's a structural fix in flight (project rule #18 — validation phase tripwires); the prompt change becomes optional once that lands.

---

### [P-MED] For "still broken" reports, attach the URL + timestamp + cookie-context

**Score**: 5.0
**Last seen**: 2026-04-27
**Recurrences**: 1
**First synthesized**: 2026-04-27

Pattern from issue #93: you reported "still 503 db_throw" after a deploy. The agent (incorrectly) went into deep local repro instead of curling prod. With the right structural fix (project rule #8) the prod state would already be smoke-tested; without it, the agent is guessing whether your report is current state or stale cache.

**Prompt change** (until rule #8 lands): when reporting "still broken" after a deploy you just saw me ship, attach what you observed: "I just hit `<URL>` at `<HH:MM>` with the owner cookie in `<browser>` and got `<status> <body>`." That short report disambiguates between (a) prod actually still broken, (b) browser/CDN cache, (c) eventual consistency on a Cosmos index propagation. Without it the agent will sometimes chase ghosts.

---

### [P-MED] When filing a "mobile app" issue, list the iOS surface paths in scope explicitly

**Score**: 5.0
**Last seen**: 2026-04-28
**Recurrences**: 1
**First synthesized**: 2026-04-28

Pattern from issue #102 ("Mobile app bugs"): the issue body described 6 sub-bugs in user-facing terms ("when host sends SMS to a user, the error is 403 chat.disabled"). The follow-up RFC and standing work list named only `public/*` and `src/*` files. The agent followed the RFC and shipped a fix entirely on the web client, missing the actual iOS app at `ios/app/(host)/...` and `ios/src/features/...`. There's a structural fix in flight (the new mistake-pattern *"When the task references mobile/iOS, inspect the `ios/` surface BEFORE coding"* will cover the agent side); a complementary user-side prompting change is to anchor any "mobile" issue body with the in-scope iOS paths.

**Prompt change**: when filing an issue whose title or body is about the mobile/iOS app, list the iOS surface paths explicitly. Examples:
- "Mobile app bugs (host: `ios/src/features/waiting/RowActions.tsx`, `ios/src/features/chat/ChatSlideOver.tsx`; admin: `ios/src/features/admin/StaffSection.tsx`)"
- "iOS Settings → Remove staff broken — `ios/app/(host)/settings.tsx` + `ios/src/features/admin/StaffSection.tsx`"

This makes it impossible for an approved RFC to omit the iOS surface for a mobile-issue. Becomes a belt-and-suspenders once the agent-side mistake-pattern fires.
