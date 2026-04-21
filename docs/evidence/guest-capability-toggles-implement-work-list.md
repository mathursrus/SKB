# Guest Capability Toggles - Implementation Work List

Issue type: feature

## Scope

- [ ] [src/types/queue.ts](C:\Users\sidma\Code\SKB\src\types\queue.ts) - add a location-level guest capability model and expose it on the public location DTO.
- [ ] [src/services/locations.ts](C:\Users\sidma\Code\SKB\src\services\locations.ts) - add defaults, validation, public projection, and update helper for guest capabilities.
- [ ] [src/routes/host.ts](C:\Users\sidma\Code\SKB\src\routes\host.ts) - expose guest capability read/write endpoints through the admin config surface.
- [ ] [src/services/queue.ts](C:\Users\sidma\Code\SKB\src\services\queue.ts) - make guest status ordering affordances depend on location capabilities, not only party state.
- [ ] [src/services/chat.ts](C:\Users\sidma\Code\SKB\src\services\chat.ts) - gate guest/host chat operations behind the new capability model.
- [ ] [src/services/orders.ts](C:\Users\sidma\Code\SKB\src\services\orders.ts) - gate draft and placement flows behind the ordering capability.
- [ ] [src/routes/queue.ts](C:\Users\sidma\Code\SKB\src\routes\queue.ts) - hide or reject SMS/chat/order guest actions when disabled.
- [ ] [public/admin.html](C:\Users\sidma\Code\SKB\public\admin.html) - add a guest-experience admin card with capability toggles.
- [ ] [public/admin.js](C:\Users\sidma\Code\SKB\public\admin.js) - load/save guest capability config and keep admin UI state coherent.
- [ ] [public/queue.html](C:\Users\sidma\Code\SKB\public\queue.html) - keep guest markup graceful when order/chat/SMS are selectively disabled.
- [ ] [public/queue.js](C:\Users\sidma\Code\SKB\public\queue.js) - consume public-config capabilities, hide unavailable guest options, and keep mixed-state rendering stable.
- [ ] [public/host.js](C:\Users\sidma\Code\SKB\public\host.js) - reflect guest capability state in host waiting-row actions and order detail affordances.
- [ ] [public/styles.css](C:\Users\sidma\Code\SKB\public\styles.css) - add layout rules so admin and guest screens remain clean for all capability combinations.

## Pattern Notes

- Use one location-scoped capability bundle rather than separate ad hoc booleans.
- Reuse the existing `updateLocation*Config` pattern and `toPublicLocation()` projection.
- Keep service-layer gating authoritative; client hiding is only presentation.
- Preserve the current waitlist join path when all capabilities remain enabled.

## Test Plan

- [ ] [tests/unit/locationGuestFeatures.test.ts](C:\Users\sidma\Code\SKB\tests\unit\locationGuestFeatures.test.ts) - validate defaults, update validation, and public projection.
- [ ] [tests/integration/guest-capability-toggles.integration.test.ts](C:\Users\sidma\Code\SKB\tests\integration\guest-capability-toggles.integration.test.ts) - cover route-level gating for SMS/chat/order combinations.
- [ ] [tests/integration/guest-ordering.integration.test.ts](C:\Users\sidma\Code\SKB\tests\integration\guest-ordering.integration.test.ts) - extend placed-order flow with ordering-disabled coverage.
- [ ] [tests/integration/chat.integration.test.ts](C:\Users\sidma\Code\SKB\tests\integration\chat.integration.test.ts) - extend service coverage for chat-disabled behavior where applicable.
- [ ] [tests/unit/adminTabs.test.ts](C:\Users\sidma\Code\SKB\tests\unit\adminTabs.test.ts) - assert the admin guest-experience card contract.
- [ ] [tests/ui/admin-tabs.ui.test.ts](C:\Users\sidma\Code\SKB\tests\ui\admin-tabs.ui.test.ts) - verify the admin config round-trip.
- [ ] [tests/ui/guest-ordering.ui.test.ts](C:\Users\sidma\Code\SKB\tests\ui\guest-ordering.ui.test.ts) - assert guest UI behavior for capability-driven rendering.
- [ ] [tests/unit/bug50Regression.test.ts](C:\Users\sidma\Code\SKB\tests\unit\bug50Regression.test.ts) - preserve chat and SMS markup contract with new conditional UI hooks.

## Validation Requirements

- `uiValidationRequired: true`
- `mobileValidationRequired: true`
- Required browser validation:
  - admin toggles save and reload correctly
  - guest queue page renders cleanly for mixed combinations of `order`, `chat`, and `sms`
  - host waiting actions reflect disabled guest capabilities without awkward gaps
- Required automated validation:
  - `npx tsc --noEmit`
  - targeted unit, integration, and UI suites for guest capabilities
  - full regression command before handoff if targeted suites pass

## Open Decisions

- `Notify` remains available even if guest chat is disabled; it is waitlist paging, not the two-way chat feature.
- If SMS is disabled at the location level, guest join requests must coerce `smsConsent` to `false` and host custom-SMS/chat actions should not expose SMS-backed guest contact affordances.
