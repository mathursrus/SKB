# Implementation Work List: Live Queue Auto-Refresh

**Issue:** live-queue-auto-refresh (no GitHub issue yet — conversational feature request)
**Type:** Feature
**Scope:** Client-side only — no server-side changes needed

## Context

The queue page (`public/queue.html` + `public/queue.js`) currently fetches diner position and wait-time data once on page load (boot) and on manual "Refresh" button tap. A diner who joins the queue and waits sees stale position/ETA data until they manually refresh. This causes anxiety and walk-aways during the 15–45 minute wait period.

The fix: add auto-refresh polling in `queue.js` that re-fetches the diner's position every 30 seconds (when in the queue) or the queue state every 60 seconds (when browsing). Use the Page Visibility API to pause polling when the tab is hidden, avoiding wasted server requests.

## Implementation Checklist

- [ ] `public/queue.js` — Add auto-refresh polling after boot and after join
  - [ ] `startAutoRefresh()` function: uses `setInterval` at 30s for in-queue diners (polls `loadStatus`), 60s for browsing diners (polls `loadState`)
  - [ ] `stopAutoRefresh()` function: clears the interval
  - [ ] Page Visibility API integration: pause polling on `visibilitychange` when `document.hidden` is true, resume when visible
  - [ ] After `onJoin` succeeds, switch from state polling to status polling (the diner just entered the queue)
  - [ ] After `loadStatus` returns `not_found / seated / no_show`, switch from status polling back to state polling (the diner left the queue)
  - [ ] After successful `loadStatus`, if `position === 1`, add a "you're next" visual class to `confCard`
- [ ] `public/queue.html` — Update confirmation card hint text
  - [ ] Change "Tap below to refresh." → "Updates automatically. Tap to refresh now."
- [ ] `public/styles.css` — Add "you're next" visual treatment
  - [ ] `.confirmation.next-up` class: gold border pulse or background highlight matching SKB's `#e3bf3d` accent
- [ ] Tests
  - [ ] Integration test in `tests/integration/` for auto-refresh behavior (verify the API endpoints return fresh data on repeated calls — server-side contract)
  - [ ] E2E test addition: verify diner position updates after host advances queue, without manual refresh
- [ ] Manual validation
  - [ ] Start dev server, join queue, observe position updating automatically
  - [ ] Verify polling pauses when tab is backgrounded (check network tab)
  - [ ] Verify "you're next" highlight appears at position 1
  - [ ] Verify refresh button still works as manual override

## Validation Requirements

- `uiValidationRequired`: true (client-side JS change affects diner-facing page)
- `mobileValidationRequired`: false (no responsive layout changes, just JS behavior)
- Browser baseline: Chrome latest (mobile viewport), Safari iOS (secondary)

## Deferrals / Out of scope

- Server-Sent Events (SSE) — better than polling but adds server complexity; defer to a follow-up if polling proves insufficient at scale
- Smart ETA from dining lifecycle data — separate feature (#2 from the recommendation), not part of this implementation
- WhatsApp/SMS notification of position change — separate feature, out of scope
