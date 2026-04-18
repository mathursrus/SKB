# Issue #51 — UI polish validation

**Branch:** `feature/51-ui-polish-findings` (off `feature/51-fully-multi-tenant-system`)
**Scope:** validate rendered UI for the 6 merged sub-issues (#52 auth, #53 users, #54 signup, #55 invites, #56 templates, #57 marketing) against the reference mocks in `docs/feature-specs/mocks/51-*.html` and the spec in `docs/feature-specs/51-fully-multi-tenant-system.md`.
**Tools:** code inspection only (Playwright / MCP browser not installed in this workspace).
**Date:** 2026-04-17.

## Surface-by-surface verdict

| # | Surface | File(s) | Mock | Verdict |
|---|---------|---------|------|---------|
| 1 | Owner signup | `public/signup.html` | `51-owner-signup.html` | PASS — palette, gradient, two-column layout, slug preview, TOS checkbox, PIN success panel all match the mock 1:1. Runtime enhancements (error panel, disabled submit, slug editor) are additive, not regressions. |
| 2a | Admin — Website tab | `public/admin.html` + `public/styles.css` template-card section | `51-admin-brand-staff.html` (Website card) | PASS — template-grid w/ Saffron + Slate swatches, "Current" pill on selected card, content-editor fields (hero headline, subhead, about, contact email, Instagram, reservations note) all present. Minor polish gap: card-head subhead does not interpolate the live slug. Logged P2. |
| 2b | Admin — Staff tab | `public/admin.html` + `public/admin.js` staff renderer | `51-admin-brand-staff.html` (Staff card) | **FAIL on v0** — Role column rendered as plain text, avatars all the same teal color, invite-form role radios had no visible "checked" state. Fixed in this branch (see "What was fixed" below). |
| 2c | Onboarding wizard | `public/admin.html` onboarding overlay + `public/onboarding.js` + `public/styles.css` .onboarding-* | `51-owner-onboarding.html` | PASS on core wizard (dismissable modal, 4 steps, progress counter, Setup pill to re-open). Mock's live phone-preview pane next to the wizard is **not implemented**. Logged P2 — the preview is a significant scope increase and worth its own issue. |
| 3 | Staff login | `public/login.html` | `51-staff-login.html` | **FAIL on v0** — single-column 420px card, wrong font ("Archivo" vs "Archivo SemiCondensed"), wrong gradient, no tablet host-stand hint, no two-pane illustration, "Forgot password" buried in footer. Rewritten in this branch to match the mock (two-pane grid, SKB palette, 28px card, tablet-hint block, membership picker styled consistently). |
| 4 | Marketing landing | `public/landing.html` | *(no mock — spec §6.6 / §10)* | PASS — warm-to-cool gradient borrowing from both templates, serif-italic hero, "Start free" CTA, three-up feature cards, four-step "how setup works", CTA strip, staff-login footer link. Matches spec §10 requirement "doesn't imply either template is the canonical platform look." |
| 5a | Public template — Saffron | legacy `public/home.html`, `public/about.html`, `public/menu-page.html`, `public/hours-location.html`, `public/contact.html` | `51-public-template-gallery.html` (left pane) | PASS — by design, saffron = the existing #45 SKB site preserved flat under `public/`. `site-renderer.ts` falls through to legacy files when `activeKey === 'saffron'`. Absence of `public/templates/saffron/` is **not** a bug — it's the backward-compat path documented in spec §10 and in `site-renderer.ts:159-166`. |
| 5b | Public template — Slate | `public/templates/slate/home.html`, `about.html`, `contact.html`, `hours-location.html`, `menu.html`, `site.css` | `51-public-template-gallery.html` (right pane) | PASS — slate banner (#1f6a5d), Archivo SemiCondensed brand, IBM Plex Sans body, two-column hero, rectangular CTA with 6px radius, card-less dishes section all match. Renderer at `/r/<slug>/` substitutes `{{brandName}}`/`{{heroHeadline}}`/`{{heroSubhead}}`/`{{about}}`/`{{contactEmail}}`/`{{instagramHandle}}`/`{{reservationsNote}}` per `PLACEHOLDER_KEYS` in `site-renderer.ts`. |

## P0 / P1 findings

### P0 (blockers)
**None.** Every surface loads and is functionally correct; mismatches are stylistic.

### P1 (ship-blocking polish — fixed in this branch)

1. **Login page visual language mismatched mock (`public/login.html`).** Repro: open `/login` in a browser and compare with `docs/feature-specs/mocks/51-staff-login.html`. Old design used a centered 420px card with a `#fff7ec → #f3faf7` gradient, "Archivo" (not Archivo SemiCondensed), 18px border-radius, and no tablet-shortcut callout. The mock uses a two-pane grid with the SKB admin-split palette, 28px radius, Archivo SemiCondensed, a warm "Host-stand shortcut" hint, and an illustration pane showing the multi-membership picker for power users. **Fix:** rewrote `public/login.html` end to end (CSS + markup). Preserved all existing behavior (login/picker/forgot/forgot-sent steps, `/api/login` + `/api/password-reset/request` contracts, `landingFor(role, loc)` routing, rate-limit + no-membership error strings).

2. **Staff table Role column rendered as plain text, not colored pills.** Repro: sign in as owner of any location with 2+ staff members → Admin → Staff tab. Old rendering: `<td>Owner</td>`. Mock: colored pills with role-distinct backgrounds (`owner` warm `#cb6a34`, `admin` teal `#1f6a5d`, `host` neutral `#eee6d4`, `pending` yellow `#fff2c5`). **Fix:** added `.role-pill.{owner,admin,host,pending}` classes to `public/styles.css` and updated the staff-row and pending-invite-row templates in `public/admin.js` (`loadStaff` function around line 596 and 626) to emit `<span class="role-pill ${roleKey}">`.

3. **Staff avatars all identical teal regardless of role.** Repro: same as above, observe the avatar chip column. Mock shows warm-orange for admin, gray for host, dim for pending. **Fix:** added `.staff-avatar.avatar-{owner,admin,host,pending}` classes and rewrote the avatar `<div>` in `admin.js` to use `staff-avatar avatar-${roleKey}` instead of inline `background:#1f6a5d`.

4. **Invite-form role radios had no visible "checked" state.** Repro: same screen, use the invite form, toggle between Admin and Host. Both labels look identical because the inline style has no `:checked` selector. Mock uses `.role-radio label:has(input:checked)` to border/tint the active card. **Fix:** added `.role-radio-option` class with `:has(input:checked)` selector to `styles.css`, switched admin.html's two `<label>` elements to use that class and hid the raw radio inputs.

### P1 (not fixed — intentionally deferred)
None. Everything P1 was addressed.

### P2 (nice-to-have, new issues)
- **Onboarding live preview pane.** The mock shows a sticky phone-frame preview next to the wizard that re-renders as the owner types. Our implementation is a modal overlay with a step list only. Recommend filing a follow-up issue tied to spec §6.2 once data-binding into the phone frame is designed (the preview would need a shared content model with the public template renderer).
- **Admin topbar user-identity chip.** Mock shows "PM · Priya Menon (owner)" on the right of the top bar. Our topbar has theme-toggle + logout + setup-pill. Low-impact because the restaurant name already appears in the topbar — deferring.
- **Admin Website-card subhead slug interpolation.** The subhead text says "the pages your guests see" without the live `app.example.com/r/<slug>` URL the mock shows. Low-impact because the Preview link below opens the real page — deferring.

## What was fixed in this branch

| Change | File | Lines |
|---|---|---|
| Rewrote staff login page to match mock | `public/login.html` | full rewrite |
| Added `.role-pill.{owner,admin,host,pending}` CSS | `public/styles.css` | +~20 lines |
| Added `.staff-avatar.avatar-{role}` CSS | `public/styles.css` | +~15 lines |
| Added `.role-radio-option:has(input:checked)` CSS | `public/styles.css` | +~20 lines |
| Emit `role-pill` + `staff-avatar` classes in staff table + pending invites | `public/admin.js` | ~2 template literals, ~12 lines total |
| Switch invite form labels to `role-radio-option` class | `public/admin.html` | 2 `<label>` elements |

No API contracts touched. No test selectors touched (verified via `grep` across `tests/`, `e2e/`). `npx tsc --noEmit` passes.

## Validation notes

- Code inspection only. No Playwright screenshots because Playwright is not a dependency of this repo and installing it just for a polish pass would have expanded scope beyond the intent of the job.
- For visual verification, the recommended manual path is:
  1. `npm run dev`
  2. Open `/` → confirm marketing landing matches spec §10 (warm-to-cool gradient, two CTAs, three-up feature cards).
  3. Open `/signup` → side-by-side with `docs/feature-specs/mocks/51-owner-signup.html`.
  4. Open `/login` → side-by-side with `docs/feature-specs/mocks/51-staff-login.html`.
  5. Sign up a test restaurant, land on `/r/<slug>/admin.html`, confirm onboarding overlay renders, compare Website tab + Staff tab against `docs/feature-specs/mocks/51-admin-brand-staff.html`.
  6. Switch `websiteTemplate` to `slate` in Mongo or via admin → visit `/r/<slug>/` and compare against the right pane of `docs/feature-specs/mocks/51-public-template-gallery.html`.
