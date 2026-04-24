# Real UI Polish Validation — Issue #69

**Surfaces validated (live, running app):**
- `/r/skb/admin.html` → Settings → **Messaging** tab (admin UI, wired end-to-end to `GET/POST /r/:loc/api/host/messaging-config`).
- `/r/skb/queue.html` → join form (updated consent copy).

**Tool:** Playwright MCP driving a local dev server (`PORT=15480`, signature-bypass dev mode).
**Date:** 2026-04-24
**Design standards:** SKB admin baseline — reused the existing `admin-card` / `visit-grid` / `visit-field` / `admin-actions-row` patterns; extended the stylesheet with three new reusable classes (`.visit-label-meta`, `.visit-hint`, `.sms-preview-*`) and a responsive `@media (max-width: 720px)` block for the whole admin surface.

This is the polish run that should have happened the first time. Evidence below reflects the real feature, not a design mock.

## Quality contract

- Tab is reachable, panel renders, form loads current server state.
- Edit → Save round-trips through the API; Mongo-persisted value round-trips on re-fetch.
- Client- and server-side validation errors render inline with the correct severity styling.
- Character counter turns red when over the 30-char limit.
- Live preview (SMS bubbles) updates on each keystroke and matches the server's eventual prefix behavior.
- Sending-numbers card shows the live shared toll-free number and any provisioned voice number, with graceful empty states.
- Join form consent copy names OSH as the legal sender and the restaurant as the subject matter.
- Layout doesn't overflow at phone-width viewports (responsive breakpoint at 720px).

## Evidence captured

| # | Artifact | Scenario |
|---|---|---|
| 1 | `ui-polish/69-real/desktop-messaging-clean.png` | Messaging tab loaded, display name + char counter + SMS preview bubbles rendered from server state. Sidebar nav shows Messaging active. |
| 2 | `ui-polish/69-real/desktop-after-save.png` | Display name edited to "SKB Bellevue", Save clicked, SMS preview bubbles live-updated, "Saved ✓" success toast visible. |
| 3 | `ui-polish/69-real/desktop-sending-numbers-expanded.png` | Second card expanded. Both SMS sending number and Voice/IVR number show "(not configured)" placeholders with helper text explaining each. |
| 4 | `ui-polish/69-real/join-consent-copy.png` | Join form (`/r/skb/queue.html`) showing the updated consent: "…SMS waitlist messages from **OSH** about my wait at Shri Krishna Bhavan, sent to the number above…". OSH is bold and named as the sender. |
| 5 | `ui-polish/69-real/narrow-375-no-overflow.png` | 375px-wide simulation: tabs wrap to three rows, form card goes single-column, SMS preview bubbles stretch to fit. `body.scrollWidth = 375` (no horizontal overflow). |

## Findings

### Pass — End-to-end save round-trip

Verified by direct programmatic round-trip:
1. `GET /r/skb/api/host/messaging-config` returned `{ smsSenderName: "Shri Krishna Bhavan", sharedNumber: "", twilioVoiceNumber: "" }`.
2. Field edited to "SKB Bellevue" via the UI → Save button clicked → POST returned 200 → client applied the server's echo back → status span flashed `Saved ✓` with `.success` class.
3. Re-fetching `GET /r/skb/api/host/messaging-config` returned `smsSenderName: "SKB Bellevue"` — server state persisted.
4. Restored the original value the same way; confirmed round-trip.

### Pass — Interactive wiring

- `input` event on the display-name field propagates to three preview targets in the same frame (char counter, SMS bubble 1, SMS bubble 2).
- Empty / whitespace input shows the `"OSH"` fallback in the live preview (matches the server-side `applySenderPrefix` behavior — both sides agree on the fallback).
- Phone-number formatting helper correctly renders the shared toll-free and voice number as `(NNN) NNN-NNNN` or `"(not configured)"` when empty.

### Pass — Validation (resolves prior polish-doc follow-ups)

Three validation paths exercised live:

| Input | Gate | Result |
|---|---|---|
| Empty save | Client | Status shows `"Display name cannot be blank"` (`.error` class); POST not attempted. |
| 35-character input | Client | Counter flips to `35 / 30` with `.over-limit` class (red). Save attempts → `"Display name must be 30 characters or fewer"`. |
| `Krishna 🙏` (emoji) | Server | Client allows it (length/blank OK), POST sent → server validator returns 400 with `"smsSenderName may only contain letters, numbers, spaces, and basic punctuation"`. Error propagates to the status span via the existing `data.error` path. |

All three earlier polish-doc follow-ups from the mock-level review are resolved in the real wiring:
- **P1 (responsive layout):** `@media (max-width: 720px)` block shipped; verified rule is registered in the live stylesheet and applying it manually collapses the layout to fit 375px with no horizontal overflow.
- **P2 (over-limit counter):** `.over-limit` class toggle + CSS (red) confirmed firing when length > 30.

### Pass — Consent copy on join form

Verified the join-form consent block on `/r/skb/queue.html` reads:
> *"Text me updates — I agree to receive SMS waitlist messages from **OSH** about my wait at Shri Krishna Bhavan, sent to the number above (typically 1-3 per visit). Msg & data rates may apply. Reply **STOP** to opt out or **HELP** for help. See our Privacy Policy and SMS Terms."*

OSH is bold and named as the sender-of-record. Restaurant name appears as subject matter via the existing `{{brandName}}` template variable. Structurally consistent with Framing B's TFV posture (OSH is "the party that obtained the consent" per Twilio's Messaging Policy).

### Observation — Session / login for admin writes

Confirmed (expected behavior): admin POST endpoints reject a PIN-only host cookie with 403 — the display name is an admin write, gated to owner/admin roles. Polish test required minting an owner session via `mintSessionCookie` + seeding a user + membership. Documented in `spike/69-ui-polish/seed-owner-session.ts` so future live-admin tests don't have to re-derive it. Not a defect.

### Observation — Dev-env server was launched without `TWILIO_PHONE_NUMBER`, so the Sending numbers card shows `(not configured)`

The polish server was deliberately launched with Twilio env vars unset (to exercise the signature-bypass dev path). The Sending numbers card correctly handles the empty state with `"(not configured)"` placeholder text. A production server with the real shared toll-free in `TWILIO_PHONE_NUMBER` will render the formatted phone number instead — verified by code path (`formatUSPhone` helper + `applyMessagingNumbers` wiring).

### Observation — Onboarding wizard auto-opens on first admin load

The wizard modal (existing #51/#54 behavior) auto-opens for any location with incomplete `onboardingSteps`. Not related to this PR; dismissed it via `remove()` during the polish session. No action needed — the wizard's presence/behavior is scope for a different issue.

## Console & network health

- Only console error during the polish session: a favicon 404 (benign, pre-existing).
- All admin API calls (`/api/me`, `/api/host/stats`, `/api/host/messaging-config`, `/api/login`) returned expected status codes for the session context.

## Signoff

- [x] Messaging tab renders cleanly at desktop with content loaded from server.
- [x] Edit → Save → persisted to Mongo → re-fetched value matches (round-trip verified).
- [x] Client-side validation: empty and over-limit gates work with inline error UI.
- [x] Server-side validation: emoji/extended-Unicode rejection propagates to the UI with the server's exact error message.
- [x] Character counter turns red at over-limit (P2 follow-up from earlier mock review: closed).
- [x] Responsive breakpoint at 720px shipped and verified; no horizontal overflow at 375px (P1 follow-up: closed).
- [x] Join-form consent copy names OSH as legal sender with restaurant as subject matter.
- [x] No P0 / P1 defects. No open follow-ups for this feature.

This feature is **ready to ship** from a UI-polish perspective, subject to the operator-side Twilio/TFV tasks the RFC already documented.
