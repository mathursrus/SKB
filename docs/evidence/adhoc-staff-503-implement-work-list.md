# Ad Hoc Staff 503 - Implement Work List

## Scope Summary

Fix the owner/admin Staff page so one malformed legacy staff or invite document does not crash `GET /r/:loc/api/staff` and surface `Failed to load staff: fetch failed: 503`.

- Scope is limited to the staff-list read path used by the Admin Staff tab.
- The route contract stays the same: `GET /r/:loc/api/staff` still returns `{ staff, pending }`.
- The fix should tolerate malformed historical rows by skipping or safely projecting them instead of failing the entire response.

Issue type: `bug`

## Discovered Patterns

- Tenant-scoped host/admin APIs live under `src/routes/host.ts` and convert unexpected backend errors to `503 temporarily unavailable` via `dbError()`.
- Staff data is assembled in `src/services/invites.ts` by `listStaffAtLocation()` and `listPendingInvites()`, then returned by `GET /staff`.
- Current projections assume Mongo `ObjectId` shape and call `.toHexString()` directly on membership/invite identifiers.
- Existing coverage for the staff route lives in `tests/integration/invites.integration.test.ts`; route/unit auth patterns live in `tests/unit/hostAuth.test.ts`.

## Validation Requirements

- `uiValidationRequired: true`
- `mobileValidationRequired: false`
- `typecheckRequired: true`
- `integrationTestRequired: true`
- `browserBaseline: Chromium in integrated browser`
- `targetJourney: owner opens /r/:loc/admin.html -> Staff tab loads active staff + pending invites without a 503 even if legacy malformed rows exist`
- `evidenceArtifact: docs/evidence/adhoc-staff-503-ui-polish-validation.md`

## Implementation Checklist

- [ ] `src/services/invites.ts` - Harden `toPublicInvite()` and/or the staff list helpers so malformed legacy identifier fields do not throw during staff-page reads.
- [ ] `tests/integration/invites.integration.test.ts` - Add a regression test that seeds malformed legacy staff/invite data, reproduces the current `503`, and locks the fixed behavior.
- [ ] `docs/evidence/adhoc-staff-503-ui-polish-validation.md` - Record manual Staff-tab validation against the browser journey.

## Quality Requirements

- Keep the fix narrow; do not change auth or role-gating behavior.
- Preserve valid staff and invite rows in the response; malformed rows should not poison the whole page.
- Follow existing route/service layering: resilience belongs in the data projection helpers, not in front-end error suppression.

## Test Strategy Slice

- Regression integration test: seed one malformed legacy row and verify `GET /r/:loc/api/staff` still returns `200` with the valid rows.
- Typecheck: run the project TypeScript build check.
- Manual browser validation: open the Staff tab as an owner and confirm the table renders instead of the red `Failed to load staff` row.
