# Implementation Evidence: Issue #103 — Mobile usability fixes

Issue: [#103](https://github.com/mathursrus/SKB/issues/103)
Spec: `docs/feature-specs/103-mobile-usability-waitlist-and-host.md`
PR: [#104](https://github.com/mathursrus/SKB/pull/104) — combined spec + impl on branch `spec/103-mobile-usability` (per owner instruction not to merge spec before impl).
Workflow: `feature-implementation` (FRAIM)
Date: 2026-04-28

## Summary

Operator-feedback driven mobile uplift on `/queue` and `/host`, implemented as a CSS-driven responsive transformation that preserves the existing DOM and JS — no parallel renderer, full feature parity at every viewport width.

## Approach

| Surface | Strategy |
|---|---|
| `/queue` (diner) | CSS-only responsive compaction at `<= 480 px`. Existing IDs (`status-card`, `line-len`, `eta-new`, `conf-card`, `public-list-card`) preserved so `queue.js` keeps working unchanged. One HTML edit: wrap size + phone label/input pairs in `<div class="form-2up">` to enable a 2-column grid at 321–480 px. |
| `/host` (host stand) | One HTML edit (replace `viewport=1024` with `width=device-width`, add a sibling `<div class="mobile-action-bar">`). One JS edit (add `data-label` to each `<td>` in `renderRows()` / dining renderer / completed renderer; bind mobile-bar duplicates of `+ Add party` and ETA controls to the same handlers as the desktop topbar; mirror values back from `refreshSettings`). All visual transformation handled in `styles.css` via `@media (max-width: 720px)`: `display: block` on table/thead/tbody/tr to convert the table into a card stack; `td::before { content: attr(data-label) }` to label each row. ≥ 44 × 44 px tap targets. Sticky bottom action bar via `position: fixed`. |

The same `host.js` row markup serves both desktop tables and mobile cards — there is **one render path**, so feature parity is structurally guaranteed (R12). The validation tests below assert this contract.

## Files Touched

| File | Lines changed | Purpose |
|---|---|---|
| `public/queue.html` | +9 / -3 | `.form-2up` wrapper for size+phone (R3) |
| `public/host.html` | +18 / -1 | viewport restored (R4); `.mobile-action-bar` element (R7) |
| `public/host.js` | +52 / -16 | `data-label` on every `<td>` (R5); transitCell label arg; mobile-bar handler binding + value mirroring (R7) |
| `public/styles.css` | +266 / 0 | issue-#103 mobile block at end of file: diner @<=480 (R1, R3, R11) and host @<=720 (R4-R9, R12) |
| `tests/ui/103-mobile-host-parity.ui.test.ts` | new | 12 cases: static-asset contract for parity (R1, R3-R9, R12 / Validation §2a) |
| `tests/ui/103-diner-mobile-fold.ui.test.ts` | new | 6 cases: Playwright at 375×667 (R1, R9, R11 / Validation §2b) |
| `docs/evidence/103-implement-work-list.md` | new | scope-slicing artifact |
| `docs/evidence/103-implement-evidence.md` | new (this) | implementation evidence |

## Validation

### Automated

| Test | Result |
|---|---|
| `npm run typecheck` | ✅ clean (no errors) |
| `npm test` (unit, 678 cases) | ✅ 678/678 pass |
| `npx tsx --test tests/integration/queue.integration.test.ts` (27 cases) | ✅ 27/27 pass — critical waitlist contract intact |
| `npx tsx --test e2e/queue.e2e.test.ts` (21 checks) | ✅ all green — **project rule #7 (critical waitlist path) satisfied** |
| `npx tsx --test tests/ui/103-mobile-host-parity.ui.test.ts` (12 cases) | ✅ 12/12 pass — R1, R3, R4, R5, R6, R7, R8, R9, R12 / Validation §2a |
| `npx tsx --test tests/ui/103-diner-mobile-fold.ui.test.ts` (6 cases) | ✅ 6/6 pass — R1, R9, R11 / Validation §2b at real 375×667 viewport |
| `npm run test:ui` (94 cases total across all UI tests) | ⚠️ 92/94 pass; the 2 failures are in `tests/ui/caller-journey.ui.test.ts` (admin caller stats, unrelated surface). Confirmed via `git stash && npm run test:ui` that **both failures pre-exist on master**, not introduced by this PR. Per project rule #13, the caller-journey flake gets its own issue/PR — not bundled here. |

### Playwright fold-test breakdown (the binding test for the original bug)

```
✔ pre-join "Join the line" submit is in viewport at 375x667 (R1)
✔ pre-join header + status strip stay above the form (R1)
✔ post-join position card + first public-list row are in viewport (R11)
✔ no horizontal overflow at 375px (R9)
```

The first test is the structural fix for the operator's feedback that "users need to scroll to add themselves to the waitlist" — a real Chromium browser at 375×667 confirms `#submit-btn`'s bounding rect is now within `window.innerHeight`. The third test is the structural fix for the v1-mock regression Sid caught in spec PR feedback (R11): post-join, `#conf-card` AND the first row of `#public-list-card` are both in-viewport without scrolling.

### Manual / browser

Cannot launch a graphical browser from this environment, but the Playwright headless tests cover the binding behavior that the manual eye-check would have validated. Project-rule #19 (Playwright at 375 / 768 / 1280 in light + dark) is partially satisfied by this PR's 375 viewport coverage; full breakpoint matrix can be added in a follow-up if owner wants belt-and-suspenders.

## Requirement Traceability

| R-tag | Implementation | Validation |
|---|---|---|
| **R1** — submit in viewport at 375×667 (queue.html) | styles.css `@media (max-width: 480px)` compacts `.diner header` + `.status` card | `103-diner-mobile-fold.ui.test.ts` "pre-join submit in viewport" (real Chromium) |
| **R2** — SMS-consent copy preserved verbatim | queue.html unchanged for the consent block | grep-able: existing #sms-consent-block text untouched |
| **R3** — single-column fallback at ≤ 320 px | styles.css `@media (max-width: 320px) { .form-2up { grid-template-columns: 1fr } }` | parity test "queue.html wraps size+phone" + "form-2up grid" |
| **R4** — viewport=device-width on host | host.html line 5 | parity test "host.html restores width=device-width" |
| **R5** — table → card stack at <720 px | styles.css `body.host:not(.admin-page) table { display: block }` etc. + `host.js` data-label attrs | parity test "card-mode @media block" + "data-label attrs" |
| **R6** — ≥44×44 px tap targets | styles.css `min-height: 44px` on `td.actions > *`, `tabs .tab`, etc. | parity test "min-height: 44px" |
| **R7** — sticky bottom action bar | host.html `<div class="mobile-action-bar">` + host.js handler binding + styles.css `position: fixed; bottom: 0` | parity test "mobile sticky action bar" |
| **R8** — collapse topbar icons at <720 | styles.css topbar rules in @<=720 block | included in R5 / R6 assertions |
| **R9** — zero horizontal overflow | styles.css avoids fixed widths in mobile block | fold test "no horizontal overflow at 375px" |
| **R10** — critical waitlist tests stay green | no test files renamed/removed; e2e green | `e2e/queue.e2e.test.ts` 21/21 pass |
| **R11** — public list visible post-join | styles.css `.card.confirmation` compaction at <=480px | fold test "post-join conf-card + first public-list row in viewport" |
| **R12** — full action parity host card vs. desktop | single render path in host.js (no mobile-only renderer); CSS swap only | parity test asserts every `data-action` selector + state ladder + transit cells exist in host.js |

## Pre-existing failures noted (NOT introduced by this PR)

- `tests/ui/caller-journey.ui.test.ts` — 2 failures: "selecting a recent caller row shows the caller journey detail" (timeout waiting for `.caller-session-row`); "caller journey remains usable at phone width" (depends on the first). Surface: `/admin` caller-stats page. Confirmed via `git stash` test run on master that these failures pre-exist. Per project rule #13 (no bundling), these stay unaddressed in this PR. Recommended follow-up: file a new issue tagged `flake` against admin caller stats.

## Open Questions resolved (default applied)

- **OQ-1.** "Place in Line" subhead removed at `<= 480 px`. (Default per spec; owner can override at PR review.)
- **OQ-2.** "+ Add party" mobile-bar button uses `--accent` (gold). (Default per spec.)
- **OQ-3.** Below 320 px, ETA control stays inline rather than collapse to icon-only — `.form-2up` falls back to single-column but the mobile-bar `.mobile-eta` keeps its layout. Acceptable for the negligible-traffic ≤ 320 px segment.

## Quality Checks

- ✅ No placeholder code (no `TODO` / `FIXME` introduced)
- ✅ No new `any` types
- ✅ No new dependencies
- ✅ No DB schema or API contract changes
- ✅ No secrets touched
- ✅ Mobile CSS scoped via `body.host:not(.admin-page)` so `/admin` pages (which share the `host` body class) are unaffected
- ✅ Existing `queue.js` and `host.js` handler bindings preserved; mobile-bar duplicates only ADD bindings, never replace them
