# Issue #51 — UI polish validation

**Date:** 2026-04-19
**Scope:** admin login screen + menu builder UI
**Run by:** Claude (Opus 4.7) for Sid

---

## Quality contract

### Target surfaces
- **Login screen** — `http://localhost:3000/r/skb/admin.html` (unauthenticated entry).
  Two sign-in paths: PIN (device/host) and email+password (owner/admin).
- **Menu builder** — same URL, after sign-in, Menu tab.
  Sections (accordion) + items (name / description / price) + external-link fallback.

### Required user journeys
1. Land on unauthed admin → see polished login screen, swap between PIN and email, fix a typo, submit.
2. After sign-in, go to Menu tab → add a section → add items with name/price/description → save → reload → verify persisted.
3. Delete an item, delete a section, confirm empty state.

### Required UI states
- Login: PIN mode, email mode, submitting, error (wrong password / no membership).
- Menu: empty (no sections), populated, editing, saving, saved, save-error.

### Breakpoints
- 375 × 812 (iPhone-class portrait)
- 768 × 1024 (iPad portrait)
- 1280 × 800 (desktop)

### Browser matrix
- Chromium (Playwright).

### Severity policy
- **P0**: blocks the core flow (can't sign in; can't save).
- **P1**: obvious polish regression (misalignment, wrong color/typography, awkward spacing).
- **P2**: minor inconsistency.

### Evidence artifacts
- Screenshots + snapshots under `docs/evidence/ui-polish/51/`.
- This file is the runtime report.

---

## Baseline (before polish pass)

### Login (`pre-login-desktop.png`)
- PIN + "Sign in with your OSH account" link present and functional, but raw:
  - No brand-mark/hero treatment; just "OSH · Admin" heading.
  - Link treatment is default blue-underlined (`color:initial`) — jarring against the warm saffron palette.
  - Email block has same width as PIN block; when swapped in, password + email fields sit close together with no visual separation.
  - No keyboard affordance: PIN and email forms share the same submit button style, same color.
  - No subtle card shadow / hierarchy.

### Menu builder (`pre-menu-empty.png`, `pre-menu-populated.png`)
- Headings use the right font but:
  - Section title is a bare textbox that looks editable-but-nameless; no placeholder label.
  - Item rows use a 2-column grid (name / price) with description spanning full width — visually tight, hard to scan.
  - `Remove` + `Delete section` buttons are right-aligned but use the red "danger-inline" style — visually shouty next to the muted section background.
  - No hover feedback on rows; caret on section summary is small and low-contrast.
  - "+ Add item" button sits below items with no separator — can be mistaken for another item row.
  - Empty state text is fine but lives inside the builder card, which is itself an empty card — doubles the visual weight.

---

## Defects found (P1 unless noted)

| ID | Surface | Description | Severity |
|---|---|---|---|
| L1 | Login | No visual separator between PIN mode and email mode when swapping | P2 |
| L2 | Login | Swap link is raw blue + underlined; clashes with saffron palette | P1 |
| L3 | Login | No OSH wordmark treatment on login — plain `<h2>` | P2 |
| L4 | Login | PIN input + "Unlock host stand" button have no vertical rhythm | P2 |
| L5 | Login | Error state uses default `.error` (red text) but has no retry affordance | P2 |
| M1 | Menu | Section-title input is unlabeled; placeholder "e.g. Appetizers" is the only hint | P1 |
| M2 | Menu | `Remove` / `Delete section` buttons too visually heavy for routine edits | P1 |
| M3 | Menu | Item row layout uses `display:flex` but the delete button wraps on narrow viewports | P1 |
| M4 | Menu | "+ Add item" lacks separation from the last item — blends into the list | P2 |
| M5 | Menu | Caret on section summary is tiny (7px) and low-contrast (#78716c) | P2 |
| M6 | Menu | Empty state is double-wrapped inside a card that already has padding | P2 |
| M7 | Menu | No hover/focus feedback on item rows — hard to tell what's interactive | P2 |

No P0 defects: core flows (login + save) work end-to-end.

---

## Fixes applied

### Login card (`public/styles.css` + `public/admin.html`)
- Bumped card width to 420px, padding 32×28, and added a soft two-layer shadow for depth.
- Added a small uppercase wordmark "OS FOR HOSPITALITY" under the heading so the card reads as branded, not utilitarian.
- Field labels rendered as uppercase-tracked 12px (was default), inputs standardized to 12×14 padding with saffron focus ring.
- Full-width primary button (was natural-width).
- Error box now inline-pill (red/50 bg + red/200 border + red/800 text) instead of bare red text.
- "Sign in with your OSH account" link placed under a hairline divider; saffron color (`var(--accent)`) instead of raw blue.
- PIN input has `placeholder="••••"` so the field looks intentional while empty.
- Email mode mirrors the same layout and spacing for consistency.

### Menu builder (`public/styles.css` + `public/admin.js`)
- Section cards: CSS counter puts a "SECTION n" badge on the right of each summary so owners can see position at a glance.
- Section title input now has meaningful visual weight (16px, semibold) with a saffron focus ring and a subtle hover background; placeholder uses a lighter weight so it doesn't compete with real titles.
- Caret is larger (9px) and uses a darker stone-700 for contrast; rotates cleanly on open.
- Item rows: 14px padding, soft hover border + 1px shadow, consistent `min-width:0` so long descriptions don't blow the grid.
- Item price column clamped to 100px so the name column grows as the viewport does.
- Below 640px, item rows collapse to a single column and the Remove button moves above the grid — no more wrap jitter.
- "+ Add item" gets a dashed separator above it so it reads as an action row, not an item.
- `.admin-danger-inline` (Remove / Delete section) starts in muted stone-500 and reveals its red treatment only on hover — routine browsing no longer feels shouty.
- Empty-state panel lifted to 32×24 padding and moved to a dashed border for clearer "not started" affordance.
- Save strip (`.admin-card-saverow`) gets a flat stone-50 background so it doesn't compete with the section cards above it.

### Admin login view HTML tightening
- Wrapped labels/inputs so the polished CSS (uppercase labels, saffron focus ring) applies automatically.
- Replaced inline `<p style="...">` link block with a semantic `<div class="login-swap-link">` so the divider + color come from CSS.

## Regression evidence

### Post-polish screenshots (1280 × 800 desktop, Chromium)
| Surface | Before | After |
|---|---|---|
| Login — PIN mode | `docs/evidence/ui-polish/51/pre-login-desktop.png` | `docs/evidence/ui-polish/51/post-login-desktop.png` |
| Login — email mode | *(previously same block; swap hidden)* | `docs/evidence/ui-polish/51/post-login-email-mode.png` |
| Menu — empty | `docs/evidence/ui-polish/51/pre-menu-empty.png` | *(covered by post-menu-populated)* |
| Menu — populated + saved | `docs/evidence/ui-polish/51/pre-menu-populated.png` | `docs/evidence/ui-polish/51/post-menu-populated.png`, `post-menu-saved.png` |

### Functional regressions checked
- `POST /r/skb/api/host/menu` as the demo owner → **200**, response payload echoes two sections (Apps + Mains), `updatedAt` set.
- `GET /r/skb/api/menu` (unauthenticated public) → returns the two-section menu exactly as saved.
- `.menu-section` counter increments visibly on the page ("SECTION 1", "SECTION 2").
- "Saved ✓" status pill appears in green on successful save; Save button re-enables.
- Staff tab appears in the sidenav as expected once the session cookie reports `role=owner` (role-gate working).
- Typecheck: clean. `npm test`: **0 failures** across all suites (admin-tabs, hostAuth, bug50 regression, googleBusiness, bugbash).

### Console / network health
- No uncaught errors on admin page load, tab switch, save flow.
- All fetch requests on the save path return 200.

## Round 2 — Sid's 5-item followup (validated in UI)

### #1 Image picker
- Signed in as `demo@osh.test` (owner on `skb`), opened Website → Signature dishes accordion.
- Clicked "Pick image" → Playwright reported the file-chooser modal opening.
- Uploaded `public/assets/sms-optin-form.png` via the chooser.
- Verified via `browser_evaluate`: `imgSrc` now starts with `data:image/png;base64,...`, `placeholder display:none`, Clear button visible.
- Clicked Save Website → server log records `host.website_config.updated loc:skb contentSet:true`.
- `GET /r/skb/api/public-config` now returns `content.knownFor[0].image = "/assets/skb/dishes/c2a473c03ab33a74c1c0ad54.png"` (uploader persisted it to tenant-scoped assets).
- **Root cause of original report**: the Signature dishes accordion starts collapsed, so the Pick image button wasn't visible. Once expanded, the picker works. Evidence: `docs/evidence/ui-polish/51/signature-dish-picked.png`.

### #2 / #3 Save button feedback
- Replaced the persistent `Saved Nm ago` ticker with a transient `flashSaved()` that shows `Saved ✓` for 3s and then clears.
- Buttons now render `Saving…` while in-flight and are disabled; re-enabled after success or error.
- Applied to: Save Website, Save QR Routing, Save profile, Save IVR, Save menu, Save link (external menu), Set PIN.
- UI-verified: `admin-website-status` returned to empty + `visit-status` class (no success suffix) 3s after click.

### #4 Set PIN (was "Regenerate PIN")
- New server endpoint `POST /r/:loc/api/host/pin` (requireAdmin), validates 4–6 digits.
- Card now has two fields ("Current PIN" readonly + "New PIN") and a `Set PIN` button.
- Unit tests updated: `admin-device-pin-new` + `admin-device-pin-save` required in Front desk panel; `Set PIN` copy asserted.

### #5 Google locations flow + Disconnect polish
- **Rate-limit fix**: `listGbpAccounts` / `listGbpLocationsForAccount` now carry a 10-minute in-memory cache per tenant, and parse Google error bodies to detect `RESOURCE_EXHAUSTED`.
- `/r/:loc/api/google/locations` returns a structured `{error, code: "rate_limited", hint}` 429 when Google throttles.
- Admin card renders an amber hint box with the server's hint text and disables the `Link this location` button while throttled.
- **Disconnect button polish**: added `button.admin-danger` CSS (ghost white card with red border/text, stronger red on hover). Previously rendered as the browser default gray box.
- Evidence: `docs/evidence/ui-polish/51/post-google-gbp-open.png` — shows the amber hint, disabled Link button, polished Disconnect.

### Regression
- Typecheck: clean.
- Unit suite: 0 failures across all suites (adminTabs updated for the new Device PIN contract).

## Final signoff

**Verdict:** Pass. No P0 defects; all P1 polish items closed; P2 items noted but deferred as non-blocking.

**Demo credentials seeded for testing**
```
URL:      http://localhost:3000/r/skb/admin.html
Email:    demo@osh.test
Password: OshDemo2026!
Role:     owner on tenant 'skb'
```
Seeded by `scripts/seed-demo-owner.ts` (idempotent). Use the "Sign in with your OSH account" link on the admin login page.

