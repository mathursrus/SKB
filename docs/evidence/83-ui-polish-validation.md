# UI Polish Validation: Issue #83 Caller Statistics

Date: 2026-04-24
Environment: local Edge headless against `http://localhost:15474`
Database: `skb_issue_83`
Viewport coverage: desktop `1440x1400`, mobile `iPhone 13`

## Seed Notes

- `caller-ui-83` contains 4 recent caller-session documents across the `7 days` and `30 days` ranges.
- `caller-empty-83` contains no caller-session documents.
- The app's current Pacific service day is 2026-04-24, so the seeded sessions intentionally leave `Today` empty while still populating `7 days` and `30 days`.

## Scenarios

| Scenario | Result | Evidence |
|---|---|---|
| Desktop dashboard, `Today` range | Pass - empty state renders cleanly with no layout break | [caller-dashboard-today-desktop.png](./ui-polish/83/caller-dashboard-today-desktop.png) |
| Desktop dashboard, `7 days` range | Pass - populated funnel renders and range switch updates coverage text | [caller-dashboard-7-days-desktop.png](./ui-polish/83/caller-dashboard-7-days-desktop.png) |
| Desktop dashboard, `30 days` range | Pass - populated funnel renders, historical coverage updates, detail card switches to selected outcome | [caller-dashboard-30-days-desktop.png](./ui-polish/83/caller-dashboard-30-days-desktop.png) |
| Error containment | Pass - caller-stats card surfaces inline error text without breaking the rest of Admin | [caller-dashboard-error-state.png](./ui-polish/83/caller-dashboard-error-state.png) |
| Empty-state location | Pass - caller-stats card shows localized empty state for a tenant with no voice sessions | [caller-dashboard-empty-state.png](./ui-polish/83/caller-dashboard-empty-state.png) |
| Mobile layout | Pass - funnel grid collapses to two columns and the page remains usable without overlap | [caller-dashboard-mobile.png](./ui-polish/83/caller-dashboard-mobile.png), [caller-dashboard-30-days-mobile.png](./ui-polish/83/caller-dashboard-30-days-mobile.png) |

## Observed Values

- `Today`: coverage note = `No caller data yet for this range.`
- `7 days`: coverage note = `Showing caller data from 2026-04-18 to 2026-04-24.`, inbound = `2`
- `30 days`: coverage note = `Showing caller data from 2026-03-26 to 2026-04-24.`, inbound = `2`
- Detail-card interaction: selecting `Hours / location only` updates the detail title to `Hours / location only`
- Error-state copy: `temporarily unavailable`
- Mobile funnel CSS: `.caller-funnel-grid` resolves to `repeat(2, 1fr)`

## Notes

- Browser validation used the real `admin.html` + `admin.js` flow, including named-user login through `/api/login`.
- The earlier login failure was not a UI bug; it came from seeding the wrong Mongo database and then tripping the in-memory login lockout while probing.
