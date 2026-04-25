# Issue 79 — Standing Work List

## Issue
- `#79` — `Catering should have an IVR entry point`
- Issue body: `And it should redirect call to another number which is configurable in admin settings`
- Issue type: `feature`

## Context Loaded
- Issue text from GitHub issue `#79`
- Existing voice IVR implementation and menu structure:
  - `src/routes/voice.ts`
  - `tests/integration/voice.integration.test.ts`
- Existing admin voice-config capability area:
  - `src/routes/host.ts`
  - `src/services/locations.ts`
  - `src/types/queue.ts`
  - `public/admin.html`
  - `public/admin.js`
- Related historical design context:
  - `docs/feature-specs/31-phone-system-integration-of-wait-list.md`
  - `docs/rfcs/46-separate-admin-view-from-host-view.md`
  - `docs/evidence/45-feature-implementation-evidence.md`

## Scope Decision
- No issue-specific spec or RFC exists for `#79`; implementation will follow the existing voice/admin patterns already established by issues `#31`, `#45`, and `#46`.
- Extend the existing `voice-config` capability area instead of creating a new settings endpoint family.
- Add a dedicated catering transfer phone field in admin settings rather than overloading `frontDeskPhone`.
- Add one new IVR branch for catering using an unused menu digit.
- Working assumption: use `press 5` for catering because `1`, `2`, `3`, `4`, and `0` are already assigned in the current main menu.

## Pattern Discovery

### Architectural Patterns
- Voice IVR routes live in `src/routes/voice.ts` and return TwiML via small route handlers plus shared formatting helpers.
- Location-scoped operational settings live on the `Location` document in `src/types/queue.ts` and are validated/updated in `src/services/locations.ts`.
- Host/admin config APIs live in `src/routes/host.ts` under `GET/POST /host/*-config`.
- Admin front-end saves settings through `public/admin.js` into existing cards in `public/admin.html`.
- Integration coverage for IVR behavior is concentrated in `tests/integration/voice.integration.test.ts`.

### Environment Patterns
- Voice routes are globally gated by `process.env.TWILIO_VOICE_ENABLED === 'true'` in `src/mcp-server.ts`.
- Twilio webhook tests use `SKB_ALLOW_UNSIGNED_TWILIO=1` when running locally without signed requests.
- No new env var should be introduced for this issue; existing location-scoped config pattern is sufficient.

### Reusable Utilities / Existing Helpers
- `normalizeFrontDeskPhone()` in `src/services/locations.ts` already handles US phone normalization and should be reused for any new transfer number field.
- Existing TwiML helper functions in `src/routes/voice.ts`:
  - `twiml()`
  - `action()`
  - `loc()`
- Existing admin voice-config fetch/save flow in `public/admin.js` should be extended, not replaced.

## Execution Checklist
- [ ] `src/types/queue.ts` — add location-level catering transfer field(s) required by issue `#79`.
- [ ] `src/services/locations.ts` — validate, normalize, persist, and return the new catering phone setting through the existing voice-config update path.
- [ ] `src/routes/host.ts` — include the catering setting in `GET/POST /host/voice-config`.
- [ ] `public/admin.html` — add the catering phone control to the existing Front desk → IVR / Phone Entry card.
- [ ] `public/admin.js` — load/save the catering setting through `api/host/voice-config`.
- [ ] `src/routes/voice.ts` — advertise the catering option in the IVR main menu when configured, route the new digit, and transfer to the catering number with graceful fallback if unset.
- [ ] `tests/unit/settings.test.ts` or another focused unit file — add validation coverage for the new voice-config field using existing location-config validation patterns.
- [ ] `tests/integration/voice.integration.test.ts` — add IVR coverage for the new catering menu branch and transfer/fallback behavior.
- [ ] `tests/integration/host-auth.integration.test.ts` and/or relevant UI-ish tests — confirm the voice-config contract includes the new field and remains admin-gated on write.

## Validation Requirements
- `buildCheckRequired`: `true`
- `unitTestsRequired`: `true`
- `integrationTestsRequired`: `true`
- `manualValidationRequired`: `true`
- `uiValidationRequired`: `true`
- `mobileValidationRequired`: `true`

## UI Validation Plan
- Front desk tab renders the new catering field in admin without breaking the existing IVR card layout.
- Save and reload round-trip keeps the catering number.
- Responsive check required for admin/frontdesk at narrow viewport because project rules treat phone usability as a core constraint.

## Manual Validation Targets
- Curl or test-server POST to `/r/:loc/api/voice/incoming` confirms the greeting advertises catering only when configured.
- Curl or test-server POST through the new menu digit reaches the catering transfer TwiML.
- Unconfigured catering phone degrades gracefully and does not hang up abruptly.
- Admin save flow persists and re-fetches the new setting from `GET /r/:loc/api/host/voice-config`.

## Risks / Decisions To Preserve
- Do not add a second admin card or endpoint family; this belongs in the existing voice-config surface.
- Do not introduce call recording; existing voice privacy preference still applies.
- Do not change current `frontDeskPhone` semantics for press-0 or large-party transfer.
- Keep the solution additive and local to the issue scope; no broader IVR redesign.
