# Issue #103 — Implementation Work List

**Spec**: `docs/feature-specs/103-mobile-usability-waitlist-and-host.md`
**Branch**: `spec/103-mobile-usability` (combined spec + impl per owner instruction)
**Type**: feature (mobile-first uplift on two existing surfaces)

## Implementation Strategy

The spec mandates **feature-parity preserving** redesigns. Strategy: keep the existing DOM produced by `host.js` / `queue.html`; drive the responsive transformation from CSS using `@media (max-width: 720px)` and `@media (max-width: 480px)` blocks. Two minimal HTML changes (a 2-up wrapper for queue.html size+phone; a mobile action bar in host.html), one minimal JS change (add `data-label` attrs to host.js's `<td>` strings so CSS can label cells in card mode + wire the mobile action-bar duplicates).

This avoids a JS-side card renderer (which would have meant duplicating row-render logic for two layouts) and keeps the >720 px desktop table layout untouched.

## Checklist

### Code

- [ ] **`public/queue.html`** — wrap the size and phone label/input pairs inside `<div class="form-2up">` so CSS can place them on a single grid row at 321–480 px.
- [ ] **`public/host.html`** — replace `viewport=width=1024,initial-scale=1` with `width=device-width,initial-scale=1`. Add a sibling `<div class="mobile-action-bar">` inside `#queue-view` containing duplicates of the `+ Add party` button and the ETA mode/turn-time controls (with `-mobile` ID suffixes). Visible only at < 720 px via CSS.
- [ ] **`public/host.js`** — add `data-label="…"` attributes to each `<td>` in `renderRows()` (Waiting), the dining renderer (Seated), and the completed renderer (Complete) so card-mode CSS can prepend column labels via `td::before { content: attr(data-label) }`. Also bind the mobile action-bar's `+ Add party` button + ETA controls to the same handlers as the desktop versions, with two-way value sync.
- [ ] **`public/styles.css`** — diner mobile block (`@media (max-width: 480px)`):
  - tighter `.diner header` padding (10/16/10 instead of 24/16/20), smaller mark and h1 fonts, header content laid out in a single row.
  - `.status` card restyled to a horizontal strip (smaller line-len, inline label and ETA).
  - `.form-2up` grid (1fr 1.6fr) with single-column fallback at ≤ 320 px.
  - compact `#conf-card`: smaller `.pos` digit (44 px), smaller paddings.
- [ ] **`public/styles.css`** — host mobile block (`@media (max-width: 720px)`):
  - `body.host { padding-bottom: 96px }` so the sticky action bar doesn't cover content.
  - `.topbar` collapses (counts strip, brand truncated, icons compact).
  - `table { display: block }`, `thead { display: none }`, `tbody { display: block }`, `tr { display: block; card chrome }`, `td { display: block; padding-left: column-label width }`.
  - column labels via `td.num::before { content: "#" }`, `td.size::before { content: "Size" }`, etc., and `td[data-label]::before { content: attr(data-label) }` for transit cells.
  - all interactive elements `min-height: 44px; min-width: 44px`.
  - `.mobile-action-bar { position: fixed; bottom: 0; … }`; `.topbar-add-btn { display: none }` and `.turn { display: none }` on mobile (the action bar replaces them).
  - dialog tightening (less padding, full-width buttons) at ≤ 375 px.

### Tests

- [ ] **`tests/ui/103-mobile-host-parity.ui.test.ts`** — Playwright. Seed a tenant + host PIN + waiting + dining parties, then at 375 × 667 assert every `[data-action]` and `[class="remove"]` from `host.js:144-156` is present in the rendered Waiting card; assert all 4 transit cells, state badge, advance button, and Departed button are present in the rendered Seated card. Re-render at 1280 × 800 and assert the same selectors are present (parity check).
- [ ] **`tests/ui/103-diner-mobile-fold.ui.test.ts`** — Playwright at 375 × 667. (a) Pre-join: assert `#submit-btn`'s bounding rect is within `window.innerHeight` (R1). (b) Post-join: assert `#conf-card` and the first `.public-list-rows > [role=listitem]` are within `window.innerHeight` (R11).

### Validation Requirements

- **uiValidationRequired**: Yes — both surfaces are user-facing.
- **mobileValidationRequired**: Yes — Playwright in mobile-emulator profile (375 × 667 iPhone-SE size) at minimum, plus 768 × 1024 tablet and 1280 × 800 desktop.
- **Browser baseline**: Chromium (project-wide default for `tests/ui/`).
- **Light + dark mode**: required per project rule #19. Run each viewport in both modes.
- **Critical waitlist path**: project rule #7 — `tests/integration/queue.integration.test.ts` and equivalents must stay green.
- **Evidence artifact**: `docs/evidence/103-implement-evidence.md` (created at Phase 5/11).

### Open Questions / Deferrals

- **OQ-1 / OQ-2 / OQ-3** from the spec are kept as defaults (subhead removed at < 480, Add-party button gold, sub-320 px ETA stays inline) unless the owner overrides during PR review.
- The implementation does NOT touch `public/queue.html` IDs (`status-card`, `line-len`, `eta-new`, `conf-card`, `public-list-card`) — `queue.js` looks them up by ID. Layout transformation is CSS-only on the diner side.

## Complexity flag

Total touched files: 5 (queue.html, host.html, host.js, styles.css, plus 2 new test files). Below the 15-file threshold for phase-splitting.
