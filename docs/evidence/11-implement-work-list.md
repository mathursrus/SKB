# Issue #11 Implement Work List

Issue: [#11](https://github.com/mathursrus/SKB/issues/11)  
Workflow: feature implementation  
Spec: [docs/feature-specs/11-rich-guest-menu-ordering.md](C:\Users\sidma\Code\SKB\docs\feature-specs\11-rich-guest-menu-ordering.md)

## Scope Summary

Implement the v1 slice defined by the spec:

- richer structured menu items in Admin
- guest draft cart + seated-only order placement
- persisted order artifact tied to a live party
- automatic `seated -> ordered` transition on successful guest submit
- host seated-party detail showing the placed order

## Issue Type

- `feature`

## Pattern Discovery

### Environment patterns

- Mongo access is centralized in [src/core/db/mongo.ts](C:\Users\sidma\Code\SKB\src\core\db\mongo.ts).
- Location- and session-scoped routes follow the `/r/:loc/api/...` pattern via [src/routes/host.ts](C:\Users\sidma\Code\SKB\src\routes\host.ts) and [src/routes/queue.ts](C:\Users\sidma\Code\SKB\src\routes\queue.ts).
- Existing env vars relevant to test execution follow the repo pattern:
  - `SKB_COOKIE_SECRET`
  - `SKB_HOST_PIN`
  - `MONGODB_DB_NAME`
  - `PORT`
  - `FRAIM_TEST_SERVER_PORT`

### Constants and utility patterns

- Time math and service-day partitioning live in [src/core/utils/time.ts](C:\Users\sidma\Code\SKB\src\core\utils\time.ts).
- Asset upload/storage helper already exists in [src/services/siteAssets.ts](C:\Users\sidma\Code\SKB\src\services\siteAssets.ts).
- Validation-heavy location/menu logic already lives in [src/services/locations.ts](C:\Users\sidma\Code\SKB\src\services\locations.ts).
- Queue state and diner status logic are centralized in [src/services/queue.ts](C:\Users\sidma\Code\SKB\src\services\queue.ts).
- Dining lifecycle transitions are centralized in [src/services/dining.ts](C:\Users\sidma\Code\SKB\src\services\dining.ts).

### Architectural patterns

- Domain-ish business logic sits in `src/services/*`.
- API request parsing and status-code translation sit in `src/routes/*`.
- Shared DTOs/types live in `src/types/*`.
- Static host/admin/diner surfaces are server-served HTML + vanilla JS in `public/*`.
- UI contract tests use stdlib HTTP fetch style under `tests/ui/*`.
- Integration tests run against the real test server and Mongo under `tests/integration/*`.

## Phase Splitting Candidate

Yes. This feature likely requires more than 15 targeted file modifications if implemented end to end in one pass.

Estimated touched files:

1. `src/types/queue.ts`
2. `src/core/db/mongo.ts`
3. `src/services/locations.ts`
4. `src/services/siteAssets.ts`
5. `src/services/queue.ts`
6. `src/services/dining.ts`
7. `src/routes/host.ts`
8. `src/routes/queue.ts`
9. `public/admin.html`
10. `public/admin.js`
11. `public/queue.html`
12. `public/queue.js`
13. `public/host.html`
14. `public/host.js`
15. `public/templates/saffron/menu.html`
16. `public/templates/slate/menu.html`
17. `tests/unit/menuValidation.test.ts`
18. `tests/integration/menu-and-pin.integration.test.ts`
19. `tests/integration/menu-render.integration.test.ts`
20. new order-focused unit/integration/UI tests

This should be treated as one coherent feature only if the user approves full execution despite the breadth.

## Standing Checklist

- [ ] `src/types/queue.ts` - extend menu item types for images, availability, required ingredients, optional ingredients, and add order/cart DTOs.
- [ ] `src/core/db/mongo.ts` - add collection accessor(s) and indexes for persisted draft/placed orders.
- [ ] `src/services/locations.ts` - extend menu validation/normalization to cover richer dish schema.
- [ ] `src/services/siteAssets.ts` - generalize image persistence so menu item images can reuse the existing upload/storage pattern safely.
- [ ] `src/services/queue.ts` - extend diner status response shape with order/cart visibility and active-order summary as needed.
- [ ] `src/services/dining.ts` - enrich dining list/detail data with placed-order presence and read model helpers.
- [ ] `src/services/` - add dedicated order service(s) for draft cart read/write, placement, idempotency, and snapshotting.
- [ ] `src/routes/host.ts` - extend menu save/read handlers for richer schema and add host read endpoint(s) for party order detail.
- [ ] `src/routes/queue.ts` - add guest order/cart endpoints bound to active party code and current lifecycle state.
- [ ] `public/admin.html` - evolve Menu tab DOM from text rows to richer dish editor controls.
- [ ] `public/admin.js` - load/save richer dish data, image upload, ingredient/add-on editors, and menu serialization.
- [ ] `public/queue.html` - add guest ordering/cart surface and relevant empty/locked/read-only states.
- [ ] `public/queue.js` - implement cart interactions, draft persistence, seated-only placement, and read-only submitted-order state.
- [ ] `public/host.html` - add host party detail surface for order summary within Seated rows.
- [ ] `public/host.js` - render order indicators and fetch/render party order detail without breaking existing lifecycle actions.
- [ ] `public/templates/saffron/menu.html` - upgrade public menu render to show image + ingredient content.
- [ ] `public/templates/slate/menu.html` - same richer public menu rendering.
- [ ] `tests/unit/menuValidation.test.ts` - extend validation coverage for richer menu item shape.
- [ ] `tests/integration/*` - add end-to-end route coverage for draft cart, order placement, lifecycle advancement, and host visibility.
- [ ] `tests/ui/*` - add/extend DOM contract coverage for admin menu builder and guest ordering surface.
- [ ] `docs/evidence/11-ui-polish-validation.md` - record manual UI validation evidence once implementation exists.

## Validation Requirements

- `buildValidationRequired: true`
- `unitTestsRequired: true`
- `integrationTestsRequired: true`
- `uiValidationRequired: true`
- `mobileValidationRequired: true`

### UI Validation

- Target journeys:
  - admin edits and saves a rich menu item
  - guest builds draft cart while waiting
  - guest places order after seating
  - host opens seated party and sees placed order
- Breakpoints:
  - `375x812` guest mobile
  - `1280x900` admin desktop
  - `1280x900` host desktop
- Browser baseline:
  - Chromium via Playwright/local browser validation
- Evidence artifact:
  - `docs/evidence/11-ui-polish-validation.md`

## Known Deferrals / Open Questions

- Kitchen queue / KDS routing is deferred in the spec and must not be smuggled into implementation.
- Payments remain out of scope.
- v1 allows exactly one guest-submitted placed order per party.
- Optional ingredient semantics still need one final implementation choice:
  - boolean selection only, or
  - boolean selection plus optional price delta display

## Workspace Notes

- The worktree already contains an unrelated modification to `package-lock.json`. Do not overwrite or revert it.
