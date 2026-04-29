---
author: sid.mathur@gmail.com
date: 2026-04-28
synthesized: 2026-04-28
---

# Postmortem: Mobile usability fixes for diner waitlist + host stand — Issue #103

**Date**: 2026-04-28
**Duration**: ~2 hours wall clock (one continuous FRAIM `feature-specification` session, including a Round-1 errata cycle)
**Objective**: Produce a feature spec for two operator-feedback driven mobile usability issues — diner waitlist join requires scrolling, and host stand is locked to a 1024 px desktop viewport.
**Outcome**: Success (with one round of corrective feedback). Spec PR #104 approved by @mathursrus. Two new requirements (R11, R12) added during Round 1 to lock down feature parity that the agent had silently regressed in v1 mocks.

## Executive Summary

The agent ran the FRAIM `feature-specification` job end-to-end on operator feedback that two surfaces (`/queue`, `/host`) were unusable on a phone. The spec, two HTML mocks, and a Phase-5 evidence document were produced and pushed as PR #104. On review, Sid approved the PR but caught two feature regressions in the mocks: the diner post-join state had silently dropped the public-list view (R3 from issue #37), and the host-page card had silently dropped four row actions, all status badges, and all Seated transition metrics. Both were fixed in a Round-1 errata commit (R11, R12 added). The errata cycle was clean — no debate, no scope creep — but the underlying agent failure (default-to-trim when redesigning) is the durable learning.

## Architectural Impact

**Has Architectural Impact**: No

The spec proposes layout-only edits to existing pages. No new entities, no new API endpoints, no DB schema changes, no auth changes. Implementation will live in `public/queue.html`, `public/host.html`, `public/styles.css`, and a small CSS-class swap in `public/host.js` for the card vs. table render branch.

## Timeline of Events

### Phase 1: context-gathering
- ✅ Read project rules (`fraim/personalized-employee/rules/project_rules.md`) and confirmed rule #5 (mobile-first) as the binding constraint.
- ✅ Inspected `public/queue.html` and `public/host.html`, identified the two root causes (header+status stack pushing the join form below the 667 px fold; `viewport=1024` lock on host).
- ✅ Filed issue #103 with explicit acceptance criteria; got "yes" from Sid to run Phases 2–7 autonomously.
- ❌ Did NOT inventory the full feature surface of either page before drafting mocks. Read `queue.html` end-to-end but skimmed `host.js` only for layout signals, not for the full row-action list.

### Phase 2: spec-drafting
- ✅ Used the FEATURESPEC template; produced a 10-R-tag spec doc with ACs, OQs, alternatives, R-tag traceability per project rule #20.
- ✅ Authored two self-contained HTML mocks per Sid's preference (P-MED entry, 2026-04-15 — inline styles, no build step).
- ❌ Mock v1 silently dropped `#public-list-card` from the diner post-join view.
- ❌ Mock v1 silently dropped 4 of 8 host row actions (Sentiment, Notify, Custom SMS, Custom Call), all status badges, and 7 of 11 Seated tab metric columns.

### Phase 3: competitor-analysis
- ✅ Filtered the 25 configured competitors to the 6 waitlist-relevant ones; cited each marketing URL; explicitly tagged unverifiable UI claims with `[unverified]` per project rule #12. No bare assertions shipped.

### Phase 4: spec-completeness-review
- ✅ All 5 issue acceptance criteria mapped to R-tags and ACs. R-tag traceability table complete per project rule #20.
- ❌ Self-review missed the feature regressions in the mocks because the review was checking *spec completeness* (R-tags map to sections, ACs exist, etc.), not *parity between mock and existing live page*.

### Phase 5: spec-submission
- ✅ Branched, committed, pushed, opened PR #104 with body, evidence comment, and cross-link from issue #103.

### Phase 6: address-feedback (Round 1)
- ✅ Two PR comments captured to `docs/evidence/103-spec-feedback.md`.
- ✅ Added R11 (post-join public-list visibility) + AC-R11 + Validation Plan §2b.
- ✅ Added R12 (host card feature parity) + AC-R12 (with explicit DOM-selector assertions traceable to `host.js:144-156` and `host.js:209-217`) + Validation Plan §2a.
- ✅ Both mocks rewritten end-to-end. Pushed as commit `4ca6333`. Resolution comment posted on PR #104.
- ✅ Coaching moment captured to `fraim/personalized-employee/learnings/raw/`.

### Phase 7: retrospective
- ✅ This document.

## Root Cause Analysis

### 1. Primary Cause — default-to-trim when redesigning an existing surface

**Problem**: When asked to redesign an existing UI for a new constraint (mobile fit), the agent defaulted to "what's the minimum viable feature set that fits?" instead of "what's the maximum-parity layout that fits?" That default produced cleaner-looking mocks but at the cost of silently removing existing shipped features.

**Impact**: Two real existing features (R3 public list, full host action surface) were dropped from v1 mocks. Sid had to catch them on review. Required a Round-1 errata commit and added two requirements to the spec that should have been baseline assumptions.

### 2. Contributing Factor — review checked spec completeness, not parity

**Problem**: The Phase-4 self-review checked that every R-tag from the issue mapped to a section, that ACs existed, that compliance was addressed, that the traceability table was full. It did not run a "diff between v1 mock and existing live page" check, which would have surfaced the regressions immediately.

**Impact**: A class of regression that was easy to detect (compare two HTML pages) slipped past the review because the review didn't include that comparison.

### 3. Contributing Factor — the user feedback was about cleanup, but the existing surface was rich

**Problem**: The operator's feedback was framed as "doesn't fit on mobile, too cluttered." That naturally biases an agent toward "trim things." But the operator's *actual* complaint was about layout, not feature count — they would not be happier with a mobile host page that was missing the Custom SMS button.

**Impact**: The agent took the surface framing at face value and over-pruned. A more careful reading would have noticed that the operator was an existing power user who knew what the desktop did and was complaining about being unable to *use* it on a phone, not about it doing too much.

## What Went Wrong

1. **Silent feature trimming.** v1 mocks dropped the public-list view + 4 host actions + all Seated metrics without flagging the trade-off as a decision the owner needed to make.
2. **Review missed an easy-to-detect regression class.** Phase-4 self-review didn't include a "mock-vs-live diff" check.
3. **Read `host.js` shallowly.** Should have grepped for every `data-action=` and `class="..."` button in the row renderers before designing the card layout.

## What Went Right

1. **Issue framing was sharp.** Filed #103 with two clearly named acceptance criteria, explicit "why one issue not two" justification, and a check-the-spec test plan. Approval came back immediately.
2. **Self-contained mocks per user preference.** Honored the P-MED preference for inline-style HTML; mocks open in a browser without a build step. Sid could review v1 directly and catch the regressions on his own.
3. **Errata cycle was clean.** Round-1 fix added R11 + R12 with explicit DOM-selector ACs traceable to specific `host.js` line ranges; mocks rewritten end-to-end; coaching moment captured. No debate, no scope creep, no "but the v1 was actually fine" pushback.
4. **Project-rule compliance held.** R-tag traceability table per rule #20, citation discipline per rule #12, no bundling violation per rule #13 (single-issue scope was justified in the PR body), critical-waitlist-path testing called out per rule #7.
5. **Evidence packaging stayed tidy.** Spec doc, two mocks, evidence doc, feedback file, retrospective, and coaching moment are all in the right places per FRAIM conventions.

## What I Almost Did Wrong But Caught

1. **Almost filed two issues instead of one.** Initial reading of project rule #13 ("no bundling") suggested two issues = two PRs. Stopped to think about it: rule #13 is about *unrelated* fixes; these share a root cause (mobile-first not enforced) and a single operator-feedback story. Filed one issue, called out the trade-off explicitly in the PR body. Sid approved the framing.
2. **Almost validated the mocks via Playwright in this environment.** Project rule #18 is sharp on this: validation phases must run against the actual surface, not against mocks. The spec phase's binding gate is in implementation. Said so explicitly in the evidence doc instead of fabricating a green check.
3. **Almost wrote a 25-competitor deep-dive section.** The mentor's Phase-3 prompt loaded all 25 from `fraim/config.json`, but most are kitchen tools, hotel software, and site builders — not waitlist competitors. Filtered to the 6 waitlist-relevant ones with explicit reasoning in the evidence doc.

## Where Past Learnings Actually Fired

1. **L1 preference — "Spec mocks are self-contained HTML with inline styles" (2026-04-15).** Mocks were authored as standalone files with all CSS inline; Sid was able to open `103-queue-mobile.html` directly in his browser and visually catch the two regressions. Without inline styles he'd have had to run a build step, and likely would have caught the issues only at implementation review — a much more expensive cycle.
2. **L1 preference — "For multi-phase FRAIM jobs, run phases 2–8 autonomously" (manager-coaching).** Confirmed Phase 1 once with the bold-defaults table (single-issue vs. two-issues), got "yes," then ran 2–7 to commit time without checkpoints. Errata cycle on Phase 6 fit the same pattern.
3. **Rule #20 — R-tag traceability table.** Adding the table during the spec draft (not after) made the Round-1 patch trivial: just add two rows for R11/R12 and update the body. Without the table I'd have re-scanned the whole doc.
4. **Rule #12 — citation discipline for externally-checkable claims.** Every competitor claim either has the marketing URL or carries `[unverified]`. Resisted the temptation to write "Yelp Host has a phone-friendly mode" without sign-in evidence.

## Lessons Learned

1. **Default to feature-parity when redesigning, not feature-minimum.** When the spec says "redesign for mobile fit," the new mock starts as an inventory of every action / badge / column / post-state surface in the existing page, and the design exercise is "find a layout that holds all of them at 375 px," not "find a clean layout." If parity is genuinely impossible, the spec MUST surface that as a trade-off requiring owner signoff — never bundled silently into the layout change.
2. **Phase-4 spec-completeness-review needs a "mock vs. live page" diff step.** Comparing the rendered v1 mock against the existing live page is mechanically easy and catches exactly this class of regression. Currently the review checks spec completeness but not this.
3. **For UI redesign tasks specifically, before drafting the mock, grep the source for every interactive element and write the inventory into the spec.** This makes the parity guarantee explicit, gives the owner an inventory they can review, and gives the implementation PR a concrete checklist. R12's DOM-selector list is exactly this artifact, just produced reactively rather than proactively.

## Agent Rule Updates Made to avoid recurrence

1. **Coaching moment captured.** `fraim/personalized-employee/learnings/raw/sid.mathur@gmail.com-2026-04-28T19-30-00-feature-parity-when-redesigning-existing-surface.md` records the pattern. `end-of-day-debrief` will synthesize it into either a P-HIGH preference, a mistake-pattern, or a project-rule on the next debrief run.
2. **Spec doc itself now contains the rule for this issue's implementation phase.** R12 mandates parity with explicit DOM-selector ACs; the implementation PR cannot pass review without a mobile audit that finds every selector listed.

## Enforcement Updates Made to avoid recurrence

1. **Validation Plan §2a (action-set parity audit).** A test that renders the host page at 375 px and 1280 px and asserts the same DOM-selector set is present in both. This is the structural fix — the next time someone (human or agent) tries to ship a mobile host UI that drops actions, this test fails.
2. **Validation Plan §2b (post-join public-list visibility).** A test that asserts both `#conf-card` and the first `.public-list-rows > *` are within `window.innerHeight` after diner join at 375 × 667. Same idea: makes the regression mechanically detectable.
3. **Suggestion for `feature-specification` job (would need FRAIM-level change, not in scope here):** add a Phase-4 step "for any redesign of an existing surface, produce a parity inventory before drafting the mock; the mock review is then a diff against the inventory." This could be a future contribute-to-fraim issue.
