# Issues #76 + #78 — Implement Work List

## Scope

Implement a backward-compatible upgrade to restaurant operating hours so:

1. Operators can configure more than just `lunch` and `dinner`, specifically supporting breakfast and special hours.
2. Operators can copy a day's hours across other days from the admin/onboarding surfaces.
3. The IVR hours branch speaks the actual configured schedule for weekends/special cases instead of assuming the first open day's lunch/dinner windows apply everywhere.

## Current Findings

- Current `WeeklyHours` / `DayHours` only model `lunch` and `dinner`.
- Admin and onboarding UIs hardcode those two windows.
- IVR speech formatter (`formatWeeklyHoursForSpeech`) reads only the first open day's lunch/dinner windows, which breaks when weekend hours differ.
- Google Business export also assumes only `lunch` and `dinner`.

## Issue Type

`feature`

Reason: issue `#76` is a feature request that requires a schema/UI capability upgrade; issue `#78` is a bug caused by the same rigid model and formatter assumptions.

## Pattern Notes

- Hours/site config flows live under `src/services/locations.ts`, `src/routes/host.ts`, `public/admin.js`, and `public/onboarding.js`.
- Voice hours rendering is isolated in `src/services/location-template.ts` and consumed by `src/routes/voice.ts`.
- Public website hours rendering is isolated in `public/site-config.js`.
- Validation tests for site config live in `tests/unit/locationConfigValidation.test.ts`.
- Voice / hours formatter tests live in `tests/unit/locationTemplate.test.ts` and `tests/integration/voice.integration.test.ts`.

## Implementation Checklist

- [ ] `src/types/queue.ts` — extend the hours model to support breakfast and special windows while preserving compatibility for existing `lunch` / `dinner` data.
- [ ] `src/services/locations.ts` — update hours validation helpers to accept the expanded hours model and keep strict time validation.
- [ ] `src/services/location-template.ts` — rewrite IVR hours formatting so it groups days by actual schedule instead of reading only the first open day's windows.
- [ ] `src/services/googleBusiness.ts` — update GBP hours export so breakfast/special windows are not dropped.
- [ ] `src/routes/host.ts` — preserve the existing site-config API contract while accepting the expanded hours payload.
- [ ] `public/admin.html` — expand the site-config hours editor UI and add a simple copy-hours control.
- [ ] `public/admin.js` — load/save the expanded hours shape and wire copy-hours behavior.
- [ ] `public/onboarding.js` — keep onboarding basics compatible with the expanded hours shape.
- [ ] `public/site-config.js` — render website hours blocks from the expanded model without assuming lunch/dinner only.
- [ ] `tests/unit/locationConfigValidation.test.ts` — add validation coverage for breakfast/special windows and backward compatibility.
- [ ] `tests/unit/locationTemplate.test.ts` — add failing coverage for weekend/special-hours IVR output and new service windows.
- [ ] `tests/integration/voice.integration.test.ts` — add integration proof that press-4 speaks weekend/special hours correctly.

## Repro Targets

- [ ] Prove current IVR hours formatting incorrectly collapses differing weekend hours into the first open day's lunch/dinner windows.
- [ ] Prove the current validation / UI model cannot express breakfast and special-hour configurations cleanly.

## Validation Requirements

- `uiValidationRequired`: yes
- `mobileValidationRequired`: no
- Browser validation:
  - Admin hours editor on desktop and narrow/mobile-width browser viewport
  - Onboarding basics hours step on desktop and narrow/mobile-width browser viewport
- Manual validation artifact:
  - `docs/evidence/76-78-ui-polish-validation.md`
- Automated validation:
  - targeted unit tests for location config + location template
  - targeted integration test for voice hours branch
  - project typecheck

## Risks / Deferrals

- Avoid a breaking storage migration; existing `lunch` / `dinner` records must continue to load and render correctly.
- Keep the public website and IVR behavior deterministic; no fallback to fabricated defaults when hours are present.
- Stay scoped to recurring operating-hours structure, not one-off holiday/date-specific closures.

## Branch Note

- Current branch at scoping time: `master`
