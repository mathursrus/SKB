# Feature Specification: Mobile usability fixes for diner waitlist + host stand

Issue: [#103](https://github.com/mathursrus/SKB/issues/103)
PR: _to be linked once created_
Workflow: `feature-specification` (FRAIM)
Date: 2026-04-28

## Summary

Operator-feedback driven spec for two mobile usability fixes:

1. **Diner waitlist (`public/queue.html`)** — header + status card push the join form below the 667 px fold; redesign collapses the status card into a 36 px strip and trims the header so "Join the line" is reachable without scrolling.
2. **Host stand (`public/host.html`)** — hard-coded `viewport=1024` violates project rule #5; redesign restores `width=device-width`, converts data tables to stacked party cards on phone-width, and floats primary host actions ("+ Add party" + ETA controls) in a sticky bottom bar.

Both fixes share the same root cause (mobile-first not enforced on these surfaces) and the same operator-feedback story, which is why they share an issue and a spec.

## Work Completed

| File | Type | Purpose |
|---|---|---|
| `docs/feature-specs/103-mobile-usability-waitlist-and-host.md` | Spec | 10 R-tagged requirements, 5 ACs, 3 OQs, design-standards section, compliance section, 6-competitor analysis, R-tag traceability table |
| `docs/feature-specs/mocks/103-queue-mobile.html` | Mock | Diner waitlist redesign: pre-join + post-join states at 375 × 667 |
| `docs/feature-specs/mocks/103-host-mobile.html` | Mock | Host stand redesign: Waiting tab card-stack + Seated tab card-stack + 1024-px desktop view side-by-side |
| `docs/evidence/103-spec-evidence.md` | Evidence | This document |

Mocks are self-contained HTML with all styles inline (per Sid's spec-mock preference, 2026-04-15) so the restaurant owner can open them in any browser without a build step.

## Completeness Evidence

- Issue tagged with label `phase:spec`: _to be set when PR is opened_
- Issue tagged with label `status:needs-review`: _to be set when PR is opened_
- All specification documents committed/synced to branch: Yes (this PR)

### Customer research

| Customer Research Area | Sources of Information |
|---|---|
| Operator (host) feedback that drove the issue | Verbal feedback captured by @mathursrus on 2026-04-28; summarized in #103 body |
| Diner-side mobile waitlist UX patterns | Public marketing pages of waitlist competitors: Yelp Guest Manager / Host, Waitwhile, Waitlist Me, NextMe, TablesReady, Waitly (URLs cited in spec §Competitive Analysis) |
| Host-side mobile UX patterns | Same set; specific UI-affordance claims marked `[unverified]` per project rule #12 (would require paid sign-in) |
| Repo-internal constraints | `public/queue.html`, `public/host.html`, `public/styles.css`, `fraim/personalized-employee/rules/project_rules.md` (rules #5, #7, #12, #19, #20) |
| User preferences | `fraim/personalized-employee/learnings/sid.mathur@gmail.com-preferences.md` (P-MED entries on inline-style mocks, hospitality tone — both honored) |

### PR feedback (post-submission)

| PR Comment | How Addressed |
|---|---|
| _none yet — to be filled in during Phase 6 (address-feedback) if reviewers leave comments_ | _n/a_ |

## Validation

- **Mocks**: hand-traced against `public/styles.css` token set (gold `#e3bf3d`, black/white, Fira Sans, 8/10/12 px radius scale). Self-contained — can be opened directly in any browser.
- **Browser-render check**: deferred — environment cannot launch a browser; this is the spec phase, so the binding validation gate is in implementation (project rule #19, Playwright at 375/768/1280 light + dark).
- **Requirement coverage**: all 5 issue acceptance criteria mapped to spec R-tags (R1, R4, R5, R6, R7, R8, R10) per project rule #20 traceability table.
- **Compliance**: TFV 30513 SMS-consent copy preserved verbatim (R2); WCAG 2.1 SC 2.5.5 tap-targets ≥ 44 × 44 px (R6); critical-path tests required green (R10).

## Quality Checks

- ✅ Spec doc complete with R-tags, ACs, error states, OQs, design-standards section, compliance section, alternatives, competitor analysis, R-tag traceability
- ✅ Mocks present for every UI change (`/queue` + `/host`)
- ✅ Mocks open as standalone HTML (no build step, inline styles)
- ✅ Spec aligns with project rules #5 (mobile-first), #7 (critical path), #12 (citation discipline), #19 (responsive light+dark validation), #20 (R-tag traceability)
- ✅ No bare assertions — every competitor claim either cites the source URL or carries `[unverified]`
- ✅ Documentation tone is consistent with the existing repo style (concise, technical, citation-first)

## Phase Completion

| Phase | Status | Artifact |
|---|---|---|
| 1. context-gathering | ✅ Complete | Issue #103 filed |
| 2. spec-drafting | ✅ Complete | `docs/feature-specs/103-mobile-usability-waitlist-and-host.md` + 2 mocks |
| 3. competitor-analysis | ✅ Complete | spec §Competitive Analysis (6 waitlist-relevant competitors, 19 non-waitlist filtered out) |
| 4. spec-completeness-review | ✅ Complete | self-review checklist (above) |
| 5. spec-submission | 🔄 In progress | this evidence doc + spec PR |
| 6. address-feedback | ⏸ Pending | post-PR-review |
| 7. retrospective | ⏸ Pending | end of feedback loop |

## Continuous Learning

| Learning | Agent Rule Updates |
|---|---|
| (placeholder) | _to be filled at Phase 7 retrospective if any durable learning emerges_ |
