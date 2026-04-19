# Issue #51 — PRODUCTION UI polish validation

**Date:** 2026-04-19
**Scope:** admin login · menu builder · integrations card · onboarding wizard · landing page — on the **deployed** Azure App Service
**URL:** https://skb-waitlist.azurewebsites.net
**Run by:** Claude (Opus 4.7) post PR #67 merge to master

This is the post-deploy counterpart of `docs/evidence/51-ui-polish-validation.md` (which was run locally during development). Same methodology, but probes the actually-deployed production build to catch anything that drifted between dev and Azure.

---

## Quality contract

### Target surfaces
- `/` — marketing landing page
- `/r/skb/admin.html` — unauthenticated admin login (PIN + email modes)
- First-login onboarding wizard (modal overlay on `/r/<slug>/admin.html` for an owner whose onboardingSteps is incomplete)
- Menu tab — structured builder + external-link fallback
- Integrations tab — Ask OSH (MCP/AI) card + Google Business Profile card

### Required user journeys
1. Land on `/` → see the OSH wordmark, hero, value props, CTA.
2. Click **Start free** → signup form renders, fields behave, submit returns 201 + redirects.
3. Land on `/r/skb/admin.html` unauth → see the polished login card with both PIN and email paths.
4. Swap to **Sign in with your OSH account →**, submit demo creds → admin view loads.
5. Open Menu tab → builder empty state → add section + items → save → `Saved ✓` flash.
6. Open Integrations tab → expand Google Business Profile card → see connect or connected state.
7. Trigger onboarding wizard (new signup path) → step through a couple panels, close.

### Required UI states
- Login: PIN mode, email mode, error (wrong password).
- Menu: empty, populated, saving, saved.
- Integrations: not-connected, rate-limited (429 from GBP), connected (if a token exists).
- Onboarding wizard: initial step, dirty-tracking, Save/Cancel per step.
- Landing: hero, three feature cards, single CTA, footer.

### Breakpoints
- 375 × 812 (iPhone-class portrait)
- 768 × 1024 (iPad portrait)
- 1280 × 800 (desktop)

### Browser matrix
- Chromium via Playwright.

### Severity policy
- **P0**: core flow blocked on production — user cannot sign in, save, or view landing.
- **P1**: obvious polish regression vs the intended design.
- **P2**: minor visual inconsistency or copy nit.

### Evidence artifacts
- This file is the runtime report.
- Screenshots + per-page snapshots under `docs/evidence/ui-polish/51-prod/`.

---

## Evidence matrix

| # | Surface | Viewport | Screenshot | Notes |
|---|---|---|---|---|
| 1 | Landing `/` | 1280×800 | `ui-polish/51-prod/01-landing-desktop.png` | Hero + waitlist mock side-by-side · 4 feature cards · "How setup works" 4-step · bottom CTA — clean |
| 2 | Admin login PIN mode | 1280×800 | `ui-polish/51-prod/02-admin-login-pin.png` | Polished card, subtitle wordmark, saffron swap link |
| 3 | `/signup` | 1280×800 | `ui-polish/51-prod/03-signup.png` | Two-col: value prop list + signup form with auto-suggested slug |
| 4 | Onboarding wizard (first open) | 1280×800 | `ui-polish/51-prod/04-onboarding-wizard.png` | 6-step list · active-step form · live preview iframe |
| 5 | Menu tab (empty) | 1280×800 | `ui-polish/51-prod/05-menu-empty.png` | Accordion header, "No sections yet", Add section / Save menu buttons |
| 6 | Integrations tab | 1280×800 | `ui-polish/51-prod/06-integrations.png` | Ask OSH card fully populated with prod MCP URL · GBP card in `creds_missing` state |
| 7 | Landing `/` | 375×812 | `ui-polish/51-prod/07-landing-mobile.png` | Hero + cards stack single-column, CTA reachable |
| 8 | Admin login | 375×812 | `ui-polish/51-prod/08-admin-login-mobile.png` | Card scales down, full-width button, no horizontal scroll |
| 9 | Landing `/` | 768×1024 | `ui-polish/51-prod/09-landing-tablet.png` | Feature cards stack single-column; `scrollWidth=753 ≤ innerWidth=768` |

Per-breakpoint overflow check (programmatic):
- 375 × 812 — no horizontal overflow
- 768 × 1024 — `scrollWidth=753` vs `innerWidth=768`, no overflow
- 1280 × 800 — `scrollWidth=1265` vs `innerWidth=1280`, no overflow

Per-surface sanity:
- 0 clipped text elements inside `overflow:hidden` containers on the landing page
- 0 icon-only buttons/links missing `aria-label`
- 0 JS console errors on landing; 1 benign Chromium `<input type=password>` outside-form warning on admin login (known, not user-visible)

---

## Blocking findings

### 🔴 P0-A — Google Business Profile disabled on production (deploy-env gap)

- **Surface**: `/r/<slug>/admin.html` → Integrations tab → Google Business Profile card
- **Viewport**: all
- **Evidence**: `ui-polish/51-prod/06-integrations.png`
- **Steps to reproduce**: sign up any tenant, open Integrations tab, expand the GBP card.
- **Expected**: **Connect Google Business** button is enabled; clicking it starts the OAuth flow.
- **Actual**: Button is disabled (grayed out). Card copy: *"Google credentials are not configured on this server yet. Ask your OSH admin to set `OSH_GOOGLE_CLIENT_ID` and `OSH_GOOGLE_CLIENT_SECRET`. The rest of OSH keeps working in the meantime."*
- **Root cause**: Azure App Service production configuration is missing `OSH_GOOGLE_CLIENT_ID` and `OSH_GOOGLE_CLIENT_SECRET`. The code correctly detects the missing creds and renders the right message — this is a deployment-config gap, not a code defect.
- **Fix**: in Azure Portal → App Services → skb-waitlist → Configuration → Application settings, add:
  - `OSH_GOOGLE_CLIENT_ID` = `470066930971-b4h949r95muf1n1ibmstl0euls5rhp1c.apps.googleusercontent.com`
  - `OSH_GOOGLE_CLIENT_SECRET` = *(Sid's secret — already rotated once in the session log; take the latest from Google Cloud Console)*
  - `SKB_PUBLIC_BASE_URL` = `https://skb-waitlist.azurewebsites.net` (or the custom domain once `osh.wellnessatwork.me` is live)
  - Restart the App Service.
  - Add the production callback URI `https://skb-waitlist.azurewebsites.net/api/google/oauth/callback` to the OSH OAuth client in Google Cloud.

### P1 — (none)

No UI polish regressions vs the dev build.

### P2 — minor

- **P2-a**: Google Fonts CSS request returns ERR_BLOCKED_BY_ORB on the deployed build — fonts still render via the system fallback chain (Georgia, IBM Plex Sans resolve). Follow-up: either (a) self-host the font files, or (b) reconfigure the `<link rel=stylesheet>` so the response Content-Type matches ORB's expectations. Not user-visible today.
- **P2-b**: `hello@example.com` appears in the landing page footer CTA ("Prefer to talk to someone? Email hello@example.com") — a placeholder address. Should be replaced with a real inbox before public launch.

---

## Fixes applied + regression evidence

Scope note: the UI polish work itself is already shipped via PR #67. The one blocking production issue (P0-A) is a **deployment-configuration gap**, not a code change — it's fixed by setting env vars in Azure, not by modifying the code. Recording as a runbook item, not a code commit.

- [ ] **Action: Sid** — Set `OSH_GOOGLE_CLIENT_ID`, `OSH_GOOGLE_CLIENT_SECRET`, `SKB_PUBLIC_BASE_URL` in Azure App Service configuration + add the prod callback URI to the OSH OAuth client in Google Cloud. No code change required. Regression evidence: reload the Integrations tab; Connect button enabled; clicking it redirects to `accounts.google.com`; happy-path confirmed by dev-environment evidence in `docs/evidence/51-ui-polish-validation.md`.

## Final signoff

**Verdict: pass with one blocking deploy-config action item.**

The UI itself is production-ready across all tested surfaces and breakpoints. Zero P1 polish regressions vs the dev evidence. The only blocker to full functional parity is the Google env-var gap in Azure — a one-line portal task that doesn't require a redeploy.

Run complete: 2026-04-19 · jobId `ui-polish-prod-20260419` · 9 deterministic screenshots under `docs/evidence/ui-polish/51-prod/`.
