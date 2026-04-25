# Ad Hoc Staff 503 - UI Validation

## Validation Scope

Target journey: owner opens `/r/:loc/admin.html`, switches to the Staff tab, and sees active staff plus pending invites without `Failed to load staff: fetch failed: 503`, even when malformed legacy membership/invite rows exist in Mongo.

Validation date: 2026-04-24
Browser baseline: Chromium via Playwright MCP
Viewports checked:
- Desktop: `1440x1100`
- Narrow browser width: `900x1100`

## Seeded Validation State

- Location: `staff503`
- Owner login: `owner-staff503@example.test`
- Malformed legacy membership row: `memberships.userId` stored as a non-ObjectId string
- Malformed legacy invite row: `invites._id` stored as a non-ObjectId string
- Valid pending invite row: `still-good-pending@example.test`

## Results

- PASS: owner login succeeded and `/r/staff503/admin.html` loaded with owner role.
- PASS: Staff tab rendered active staff instead of the red `Failed to load staff` error row.
- PASS: valid owner row remained visible.
- PASS: malformed legacy rows were skipped instead of poisoning the whole response.
- PASS: valid pending invite `still-good-pending@example.test` remained visible.
- PASS: same result held at both `1440px` and `900px` browser widths.

## Automated Validation Executed

- `npm run build`
- `npm run typecheck`
- `npx tsx --test tests/unit/invites.test.ts`
- `npx tsx --test tests/integration/invites.integration.test.ts`

## Browser Evidence

- Desktop screenshot: [staff-tab-desktop.png](/abs/path/C:/Users/sidma/Code/SKB/docs/evidence/ui-polish/adhoc-staff-503/staff-tab-desktop.png)
- Narrow screenshot: [staff-tab-narrow.png](/abs/path/C:/Users/sidma/Code/SKB/docs/evidence/ui-polish/adhoc-staff-503/staff-tab-narrow.png)

## Notes

- Existing untracked files `tmp.integration.*` and `tmp.sms.*` predated this fix and were left untouched.
