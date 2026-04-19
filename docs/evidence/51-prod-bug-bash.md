# Issue #51 — PRODUCTION bug bash

**Date:** 2026-04-19
**Build tested:** master @ `cf92f67` deployed at https://skb-waitlist.azurewebsites.net
**Persona:** First-time restaurant owner (Marisol Alvarez, 30-seat taqueria, Seattle — phone-first, wants to be live tonight)
**Journeys covered:** landing · signup · onboarding wizard · menu builder · website · QR routing · guest-side join flow
**Run by:** Claude (Opus 4.7) post PR #67 merge

---

## Bug inventory

### 🔴 P1 (schedule before inviting real restaurants)

#### P1-A — Public `/menu` page ignores the structured menu an owner just built

- **Category:** Functionality
- **Journey:** Menu builder → view as guest
- **Screenshot:** `docs/evidence/bug-bash/51-prod/bug-menu-page-shows-template-default.png`
- **Steps to reproduce:**
  1. Sign up any new tenant on prod.
  2. Open admin → Menu tab → add a section ("Appetizers") with 2 items ("Samosa $8", "Pakora $6").
  3. Click **Save menu** → `Saved ✓`.
  4. Open the public-facing page: `/r/<slug>/menu`.
- **Expected:** Public menu page lists the sections and items the owner just saved.
- **Actual:** Page renders the template's static fallback text: *"Our Menu — Every dish prepared fresh to order. Menu coming soon. CONTACT US FOR DETAILS"*. The structured menu data is stored (confirmed via `GET /r/:loc/api/menu` returns the saved sections) but never reaches the template renderer.
- **Root cause:** `templates/saffron/menu.html` (and `slate/menu.html`) weren't updated to iterate over `menu.sections` / `section.items` when the Menu tab was moved from an external-URL placeholder to a structured builder. They still emit the "coming soon" placeholder unconditionally.
- **Suggested fix:**
  - Extend the template renderer in `src/routes/site-renderer.ts` (or wherever the `/r/:loc/menu` route resolves) to expose `location.menu` as template data.
  - Update both saffron and slate `menu.html` to render `{{#each menu.sections}} ... {{#each items}} ... {{/each}} {{/each}}` with proper HTML escaping on `name`/`description`/`price`.
  - Keep the "coming soon" block as the fallback only when `menu.sections` is empty **and** `menuUrl` is not set.
  - Add a UI integration test that round-trips a menu save → GET `/r/:loc/menu` → parse the rendered HTML and assert the item names appear, escaped.
- **Effort:** Medium (1–2 hours — template edits plus test).
- **Why P1 not P0:** The admin-side menu save works and the public menu URL still loads (just shows the placeholder), so the site isn't broken — it just defeats half the value of the new Menu Builder feature.

### 🟡 P2 (polish, not blocking)

#### P2-a — Landing-page footer uses the placeholder email `hello@example.com`

- **Category:** Copy / content
- **Journey:** Landing page, "Tonight, just host…" bottom CTA card
- **Steps to reproduce:** Visit `/`, scroll to the bottom CTA card.
- **Actual:** *"Prefer to talk to someone? Email hello@example.com"* — `example.com` is reserved for placeholders per RFC 2606.
- **Suggested fix:** Replace with a real inbox (e.g. `hello@wellnessatwork.me` once the domain is attached, or `sid.mathur@gmail.com` for now). Same placeholder also shows on the signup page sidebar.
- **Effort:** Quick fix (1 line in `public/landing.html` + `public/signup.html`).

#### P2-b — Front-desk phone validation rejects `+1` country-code formats without guidance

- **Category:** UX / form validation
- **Journey:** Admin → Front desk → IVR / Phone Entry → set `Front desk phone`
- **Steps to reproduce:** Submit `+12065551234` in the front-desk phone field.
- **Expected:** Either accept the `+1` prefix and strip it, or tell the user "US phone only — enter 10 digits without the +1".
- **Actual:** 400 `frontDeskPhone must be a 10-digit phone number` — correct intent, unhelpful to a US owner who pasted their phone from their contacts.
- **Suggested fix:** `normalizePhoneInput()` in `src/services/locations.ts` could strip a leading `+1` before validating 10 digits. Or update the form `<input>` placeholder + help text to say "10 digits, US-only".
- **Effort:** Quick fix.

#### P2-c — Google Fonts stylesheet blocked by browser ORB on production

- **Category:** Runtime / network health
- **Journey:** Any page that loads Google Fonts (`/`, `/signup`, `/r/<slug>/...`).
- **Actual:** Two `GET https://fonts.googleapis.com/css2?family=...` requests return `net::ERR_BLOCKED_BY_ORB` (Opaque Response Blocking). The browser falls back to system Georgia/IBM Plex Sans so text still renders correctly.
- **Suggested fix:** Either self-host the woff2 files under `/public/assets/fonts/` and remove the Google Fonts request, or verify the `<link rel="stylesheet" href="…fonts.googleapis.com/css2…">` tag has the right `crossorigin` attribute so the response content-type isn't stripped.
- **Effort:** Medium (self-host: 1 hr) / Quick (header fix: 5 min to try).

### 🟡 Deploy-config (carried over from UI polish run — not re-filed)

- Google Business Profile `creds_missing` state on prod: Azure App Service needs `OSH_GOOGLE_CLIENT_ID` + `OSH_GOOGLE_CLIENT_SECRET` env vars set. Runbook in `docs/evidence/51-prod-ui-polish-validation.md`.

---

## What passed cleanly

The bulk of the system behaved exactly as designed. Positive-path evidence:

| Surface | Result |
|---|---|
| Landing (desktop · tablet · mobile) | No horizontal overflow at 375/768/1280. Hero, feature cards, "How setup works", bottom CTA all render correctly. |
| Signup validation | Missing TOS → 400 `must accept terms`. Short password → 400 `password must be at least 10 chars`. Bad email → 400 `email must be a valid email address`. Duplicate email → 409 `email already registered`. Happy path → 201 + auto-login + redirect to admin. |
| Admin login (PIN + email) | Polished card, saffron focus rings, session cookie set, demo seeder / real signup both end in the admin view. |
| Onboarding wizard | Overlay opens for new tenant with 0 completed steps. 6 steps listed. Live iframe preview shows the new tenant's public site with restaurant name + default hero. |
| Menu builder edge cases | Null clear → 200 + `sections=[]`. Missing sections → 400 `menu.sections must be an array`. 81-char title → 400 with limit. Item without name → 400. Emoji + non-Latin unicode (`🌮 Tacos 特別`) round-trips intact via `GET /api/menu`. Literal `<script>` payload stored as text (not executed — because the public template currently doesn't render any of it, see P1-A). |
| Voice-config validation | Non-numeric phone, 9-digit phone, out-of-range threshold all 400 with specific errors. |
| Guest join flow | `/r/<slug>/visit` → auto-redirects to `/r/<slug>/queue.html`. Join form works. Code generation uses tenant-derived prefix (`OSHP-5B6` from `osh-polish-probe`). Name is redacted to `Bug D.` in the public "who's in line" panel. Live timer updates. "You're next" / "Promised by" states render. |
| Auth session persistence | Session survived across multiple navigations, reloads, API probes. `/api/me` returned `role: 'owner', locationId: 'osh-polish-probe'` 20+ minutes into the run. |
| Tenant isolation | Polish-probe's tenant slug flowed correctly into MCP header, queue code prefix, public URL, Claude Code snippet — no cross-contamination with `skb`. |

---

## Prioritization summary

| Priority | Count | Quick wins? |
|---|---|---|
| P0 (critical) | 0 (code side) · 1 deploy-config from prior run | — |
| P1 (high) | 1 — structured menu not rendered | Medium effort, high impact on the "build a menu in OSH and your guests see it" value prop |
| P2 (polish) | 3 — placeholder email, phone format, Google Fonts ORB | All quick fixes |

**Recommended order:**
1. **P1-A** — write the menu template + integration test (unblocks the "menu in 10 minutes" story).
2. **P2-a** — swap the placeholder email (1-line change, catches the eye of every visitor).
3. **P0 deploy-config** — Sid sets the Azure env vars (2-minute Portal task).
4. **P2-b / P2-c** — phone normalization + font delivery polish as time permits.
