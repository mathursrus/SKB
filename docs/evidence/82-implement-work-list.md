# Issue 82 - Implement Work List

## Scope Summary

Issue #82 is a **feature**. The current guest capability model supports `sms`, `chat`, and `order`, but it does **not** support enabling guest menu browsing separately from guest ordering. Today, if `order` is off, the entire guest order surface disappears, which conflicts with the issue requirement that guests should still be able to browse the menu while on the waitlist when ordering is disabled.

The current implementation already supports:

- rich structured menu data in `Location.menu`
- guest cart draft persistence
- seated-only order placement
- public guest feature exposure via `/r/:loc/api/public-config`
- owner/admin guest capability editing in Admin > Front desk > Guest Experience

The issue-scoped gap is:

- add a distinct guest-facing **menu browsing** capability
- keep **ordering** as a separate capability layered on top of menu browsing
- preserve the current seated-only placement behavior and message when that gate is active

## Codebase Patterns

### Architecture / Ownership

- `src/services/locations.ts`
  - canonical location config validation + persistence
  - source of truth for `GuestFeatures`
  - public projection via `toPublicLocation(...)`
- `src/routes/host.ts`
  - admin/owner config endpoints under `/r/:loc/api/host/*`
  - current guest capability read/write endpoints
- `src/routes/queue.ts`
  - guest-facing API enforcement for capability gates
- `src/services/orders.ts`
  - cart + placement business rules
- `src/services/queue.ts`
  - guest status payload composition (`order`, `canManageOrder`, `canPlaceOrder`)
- `public/admin.html` + `public/admin.js`
  - admin UI contract for Guest Experience controls
- `public/queue.html` + `public/queue.js`
  - guest UI contract for waitlist/order tabs and capability-driven rendering

### Environment / Config

- No new environment variables are needed for this issue.
- Existing feature control pattern is persisted in MongoDB on `Location.guestFeatures`.

### Constants / Validation Patterns

- `DEFAULT_GUEST_FEATURES` lives in `src/services/locations.ts`
- boolean capability validation is centralized in `validateGuestFeaturesUpdate(...)`
- public-safe config shape is centralized in `toPublicLocation(...)`
- ordering state gates live in `src/services/orders.ts` and `src/services/queue.ts`

### Test Patterns

- unit validation tests in `tests/unit/locationConfigValidation.test.ts`
- integration capability tests in `tests/integration/guest-capability-toggles.integration.test.ts`
- guest ordering integration tests in `tests/integration/guest-ordering.integration.test.ts`
- UI contract tests in `tests/ui/guest-ordering.ui.test.ts`

## Standing Checklist

- [ ] `src/types/queue.ts` - extend `GuestFeatures` with a distinct menu-browsing capability and keep typing aligned across public/admin/guest DTOs.
- [ ] `src/services/locations.ts` - update guest feature defaults, validation, persistence merge behavior, and public projection for the new capability.
- [ ] `src/routes/host.ts` - allow admin save/load of the new guest menu capability.
- [ ] `public/admin.html` - add Guest Experience control copy/selector for guest menu browsing.
- [ ] `public/admin.js` - load/save the new guest menu capability and keep existing order/chat/sms behavior intact.
- [ ] `src/routes/queue.ts` - gate menu/order guest endpoints correctly so menu browsing can remain available when ordering is disabled.
- [ ] `src/services/queue.ts` - return guest status flags consistent with separate menu vs order capabilities.
- [ ] `public/queue.html` - adjust guest copy/labels if needed so menu browsing without ordering is understandable.
- [ ] `public/queue.js` - render the guest menu surface when menu browsing is enabled, hide cart actions when ordering is disabled, and preserve the existing seated-only placement messaging.
- [ ] `tests/unit/locationConfigValidation.test.ts` - cover the new capability defaulting/public projection/validation behavior.
- [ ] `tests/integration/guest-capability-toggles.integration.test.ts` - add coverage for menu-on/order-off behavior and public-config exposure.
- [ ] `tests/integration/guest-ordering.integration.test.ts` or a new focused integration test - verify browse-only mode does not allow draft/place operations while still exposing menu data.
- [ ] `tests/ui/guest-ordering.ui.test.ts` and admin UI tests - update DOM/JS contract expectations for the new guest menu toggle and browse-only rendering.

## Validation Requirements

- `uiValidationRequired: true`
- `mobileValidationRequired: true`
- Browser validation baseline:
  - guest queue page on phone-width portrait viewport
  - admin Guest Experience controls on admin/frontdesk surface
- Required manual journeys:
  - menu on + order off: guest can browse menu while on waitlist, cannot add/place order
  - menu on + order on: guest can add to cart
  - seated-only placement remains unchanged: pre-seated guest sees the wait-to-be-seated message; seated guest can place order
- Evidence artifact required if guest/admin UI changes materially:
  - `docs/evidence/82-ui-polish-validation.md`

## Open Questions / Guardrails

- Prefer minimal schema expansion: add only the capability needed for menu browsing; do not redesign the broader guest feature model.
- Do not change the existing default seated-only placement rule unless the issue explicitly requires a separate admin-configurable placement-policy toggle.
- Keep the waitlist-critical path green per project rule 7.
