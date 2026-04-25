# Feature Implementation Evidence: Issue #82 - Menu and Ordering customizations

Issue: [#82](https://github.com/mathursrus/SKB/issues/82)
Branch: `feature/82-menu-and-ordering-customizations`
Work list: [82-implement-work-list.md](./82-implement-work-list.md)
UI validation: [82-ui-polish-validation.md](./82-ui-polish-validation.md)

## Summary

- Added a distinct guest `menu` capability so menu browsing can stay enabled even when guest ordering is disabled.
- Updated admin Guest Experience controls to manage `menu`, `order`, `chat`, and `sms` independently, while coercing `menu=true` whenever `order=true`.
- Updated the guest queue experience so browse-only mode shows menu content without cart actions, while the existing seated-only order placement rule remains unchanged when ordering is enabled.

## Traceability Matrix

| Requirement / Acceptance Criterion | Implemented File / Function | Proof | Status |
| --- | --- | --- | --- |
| Guests can browse the menu while on the waitlist even when ordering is disabled. | `src/types/queue.ts`, `src/services/locations.ts`, `public/queue.js` | `tests/integration/guest-capability-toggles.integration.test.ts`; `tests/ui/guest-ordering.ui.test.ts`; Scenario 2 in `82-ui-polish-validation.md` | Met |
| Owners can configure guest menu browsing separately from ordering. | `src/routes/host.ts`, `public/admin.html`, `public/admin.js` | `tests/ui/admin-tabs.ui.test.ts`; Scenario 1 in `82-ui-polish-validation.md` | Met |
| Enabling ordering continues to restore cart behavior and seated-only placement gating. | `src/services/locations.ts`, `public/queue.js` | `tests/integration/guest-ordering.integration.test.ts`; Scenarios 3 and 4 in `82-ui-polish-validation.md` | Met |
| Public config and location defaults stay consistent with the expanded guest feature model. | `src/services/locations.ts`, `public/host.js` | `tests/unit/locationConfigValidation.test.ts`; `tests/integration/guest-capability-toggles.integration.test.ts` | Met |
| Mobile-width and tablet-width guest flows remain usable after the UI change. | `public/queue.js`, `public/admin.html`, `public/admin.js` | Scenarios 1-5 in `82-ui-polish-validation.md` | Met |

## Changed Areas

- `src/types/queue.ts`
  - Added `GuestFeatures.menu`.
- `src/services/locations.ts`
  - Added `menu` to defaults, validation, public projection, and guest-feature persistence.
  - Ensured `order=true` cannot persist with `menu=false`.
- `src/routes/host.ts`
  - Accepted `menu` in the host guest-features API.
- `public/admin.html`, `public/admin.js`
  - Added the admin control to save and load menu browsing separately from ordering.
- `public/queue.js`
  - Switched guest menu rendering to key off `menuEnabled()`.
  - Added browse-only rendering with no cart actions when `order=false`.
  - Preserved seated-only order placement behavior when `order=true`.
- `public/host.js`
  - Updated default guest feature shape for public config consumers.
- Tests
  - Updated unit, integration, and UI suites for the expanded guest feature model.

## Validation Evidence

- Build:
  - `npm run build`
- Unit:
  - `npx tsx --test tests/unit/locationConfigValidation.test.ts`
- UI contract:
  - `npx tsx --test --test-concurrency=1 tests/ui/guest-ordering.ui.test.ts tests/ui/admin-tabs.ui.test.ts`
- Integration:
  - `npx tsx --test --test-concurrency=1 tests/integration/guest-capability-toggles.integration.test.ts`
  - `npx tsx --test --test-concurrency=1 tests/integration/guest-ordering.integration.test.ts`
- Manual/browser validation:
  - Owner set `menu=On`, `order=Off` and saved successfully in Admin > Front desk > Guest Experience.
  - Guest queue page at phone-width (`390x844`) showed a `Menu` tab, published dishes, no add-to-cart buttons, and no cart when ordering was off.
  - Re-enabling ordering restored add-to-cart controls, but `Place order` stayed disabled until the party was seated.
  - After seating, the same guest could add an item and place the order from the phone flow.
  - Tablet-width (`768x1024`) validation showed no horizontal overflow.

## Security Review

### Executive Summary

- Findings: 0 critical, 0 high, 0 medium, 0 low.
- Disposition: no blocking findings; proceed.

### Review Scope

- `reviewScope = diff`
- Reviewed paths:
  - `public/admin.html`
  - `public/admin.js`
  - `public/host.js`
  - `public/queue.js`
  - `src/routes/host.ts`
  - `src/services/locations.ts`
  - `src/types/queue.ts`
  - `tests/integration/guest-capability-toggles.integration.test.ts`
  - `tests/ui/admin-tabs.ui.test.ts`
  - `tests/ui/guest-ordering.ui.test.ts`
  - `tests/unit/locationConfigValidation.test.ts`

### Threat Surface Summary

- `web`
  - Admin guest-feature controls and guest queue/menu rendering changed.
- `api`
  - Host guest-feature update handling changed in `src/routes/host.ts`.
  - Guest-feature persistence and validation changed in `src/services/locations.ts`.

### Coverage Matrix

| Category | Status | Notes |
| --- | --- | --- |
| OWASP Top 10 Web | Pass | The diff changes conditional rendering and text only; no new raw HTML sinks, auth flows, or client-side storage of sensitive data were introduced. |
| OWASP API Top 10 | Pass | The changed API path remains behind `requireAdmin`; the new `menu` field is validated as boolean server-side before persistence. |
| Secrets in Code | Pass | No credentials, tokens, or production secrets were added in the diff. |
| Privacy / PII | Pass | The change only expands guest feature toggles; it does not add new PII collection, storage, or exposure paths. |
| Capability Authoring | N/A | No FRAIM skills, jobs, or rules changed. |

### Findings

- None.

### Prioritized Remediation Queue

- None.

### Verification Evidence

- Diff review of all changed web and API files.
- Validation confirmed browse-only mode hides cart actions instead of bypassing server-side ordering gates.
- Existing order-placement behavior remained seated-gated in manual validation and the guest ordering integration suite.

### Applied Fixes and Filed Work Items

- No additional security fixes were required beyond the implementation already in this branch.
- No follow-up security work items filed.

### Accepted / Deferred / Blocked

- Accepted:
  - GitHub Advanced Security secret scanning was not used; compensated with focused diff review of the changed files.
- Deferred:
  - None.
- Blocked:
  - None.

### Compliance Control Mapping

- N/A for this issue.

### Run Metadata

- Review date: 2026-04-24 America/Los_Angeles
- Reviewer: Codex
- Head commit at review completion: `ba61eb12aefe283d9a24229577b948e993b68b58`
- Environment notes:
  - Local development server and Playwright MCP browser validation
  - Review limited to the issue 82 diff
