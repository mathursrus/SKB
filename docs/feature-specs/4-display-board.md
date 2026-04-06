# Feature Spec: Queue Display Board for Restaurant TV

**Issue:** [#4](https://github.com/mathursrus/SKB/issues/4)
**Status:** Draft
**Date:** 2026-04-04

---

## Customer & Their Problem

SKB diners who have joined the waitlist repeatedly check their phones or walk up to the host stand asking "is it my turn yet?" This creates anxiety for the customer and interrupts the host, slowing down seating throughput. A visible, always-on queue board mounted on the restaurant TV would let every waiting diner see their status at a glance, reducing both phone-checking and host interruptions.

---

## User Experience

1. The restaurant staff opens `https://skb-waitlist.azurewebsites.net/board.html` on the TV's browser (or a connected device like a Fire Stick / Chromecast).
2. The page loads in full-screen landscape layout with SKB branding (black header, gold accent, Fira Sans).
3. A table displays every active party in queue order: position number, party code (e.g. `SKB-7Q3`), and a status badge (`Waiting` or `Called`).
4. Parties whose status is `Called` are highlighted with a gold background row and a gold `CALLED` badge, making them visually distinct from 3-5 meters away.
5. The board auto-refreshes every 5 seconds. No manual interaction is needed after initial load.
6. When the queue is empty, the board shows a centered message: "No one waiting -- walk right in!"
7. When parties are seated or marked no-show by the host, they disappear from the board on the next refresh cycle.
8. No names, phone numbers, or party sizes are shown -- only the opaque party code and status.

---

## Functional Requirements

### Backend

| ID | Requirement |
|----|-------------|
| R1 | New public endpoint `GET /api/queue/board` added to the diner-facing queue router (`src/routes/queue.ts`). No authentication required. |
| R2 | The endpoint returns a JSON object `{ parties: BoardPartyDTO[], updatedAt: string }`. |
| R3 | `BoardPartyDTO` contains only: `{ position: number, code: string, state: "waiting" \| "called" }`. No name, phone, party size, or ETA fields. |
| R4 | The endpoint reuses `listHostQueue()` internally, mapping each `HostPartyDTO` to a `BoardPartyDTO` (stripping PII). |
| R5 | New type `BoardPartyDTO` and `BoardDTO` added to `src/types/queue.ts`. |
| R6 | A new service function `listBoardQueue()` is added to `src/services/queue.ts` that calls `listHostQueue()` and projects to board-safe fields only. |

### Frontend

| ID | Requirement |
|----|-------------|
| R7  | New static page `public/board.html` served by Express static middleware (no new route needed). |
| R8  | New script `public/board.js` handles polling and DOM updates. |
| R9  | The page uses `setInterval` to call `GET /api/queue/board` every 5 seconds. |
| R10 | Layout is landscape-optimized: full viewport width, no horizontal scroll, large text readable from 3-5 meters. |
| R11 | Font sizes: position number >= 48px, party code >= 36px, status badge >= 24px. |
| R12 | SKB branding: black header with gold `SKB` mark, gold accent border, white body, Fira Sans font -- matching `public/queue.html` and `public/styles.css` existing design tokens. |
| R13 | Called parties: row background `#fff8e1` (matches existing `row-called` style), gold `CALLED` badge using `var(--accent)`. |
| R14 | Waiting parties: neutral row background, muted `WAITING` badge. |
| R15 | Empty state: centered message "No one waiting -- walk right in!" in large text with the SKB mark above it. |
| R16 | Board styles are added to `public/styles.css` under a `.board` body-class section, following the existing pattern (`.diner`, `.host`). |
| R17 | The page sets `<meta name="viewport" content="width=1920,initial-scale=1">` to target TV resolution. |

---

## Acceptance Criteria

### AC-1: Board page loads and displays queue
- **Given** the queue has 3 parties (2 waiting, 1 called)
- **When** a user navigates to `/board.html`
- **Then** the page shows 3 rows with correct position numbers (1, 2, 3), party codes, and status badges (`WAITING`, `WAITING`, `CALLED` respectively)

### AC-2: Privacy -- no PII on board
- **Given** the queue has parties with names, phone numbers, and party sizes
- **When** the board endpoint responds or the page renders
- **Then** no names, phone numbers, party sizes, or ETA times appear in the API response or on screen

### AC-3: Auto-refresh
- **Given** the board page is open and a new party joins the queue
- **When** 5 seconds elapse
- **Then** the board updates to show the new party without any user interaction

### AC-4: Called party highlighting
- **Given** a party's state is `called`
- **When** the board renders
- **Then** that row has a gold-tinted background and a gold `CALLED` badge, visually distinguishable from `WAITING` rows at 3-5 meters

### AC-5: Empty queue
- **Given** no active parties exist in today's queue
- **When** the board renders
- **Then** the page shows "No one waiting -- walk right in!" centered on screen

### AC-6: Party removal
- **Given** the board shows 3 parties and the host seats party #1
- **When** the next auto-refresh fires
- **Then** party #1 disappears and the remaining parties are renumbered (1, 2)

### AC-7: Board endpoint shape
- **Given** a `GET /api/queue/board` request
- **When** the server responds
- **Then** the response body matches `{ parties: [{ position, code, state }], updatedAt }` with no additional fields

---

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| **TV loses network** | The board keeps showing the last fetched data. A subtle "Last updated X ago" footer timestamp lets staff notice staleness. If no successful fetch for > 30 seconds, show a non-intrusive "Connection lost" indicator. |
| **Very long queue (30+ parties)** | The table should not require scrolling. Rows auto-size font to fit. If the queue exceeds what fits on one screen, consider paginating with an auto-rotating carousel (future enhancement -- V1 can allow vertical scroll). |
| **Simultaneous board viewers** | Multiple TVs or devices can open `/board.html`. The endpoint is stateless and read-only -- no coordination needed. |
| **Service day rollover** | The board query is scoped to today's `serviceDay` (same as `listHostQueue`). At midnight PT, stale entries from the prior day stop appearing. |
| **Rapid state changes** | Because the board polls every 5 seconds, there is up to a 5-second delay between a host action and the board reflecting it. This is acceptable for a wall display. |
| **Code collision / retry** | Not applicable to the board -- codes are generated at join time. The board only reads existing codes. |

---

## Validation Plan

1. **Unit tests**
   - `listBoardQueue()` returns only `position`, `code`, `state` fields (no PII leakage).
   - `listBoardQueue()` returns an empty array when no active parties exist.
   - `BoardPartyDTO` type is correctly defined (compile-time check).

2. **Integration / API tests**
   - `GET /api/queue/board` returns 200 with correct shape.
   - `GET /api/queue/board` does not include `name`, `phoneLast4`, `partySize`, or `etaAt` in response.
   - Response updates within one poll cycle after a party is added, called, or removed.

3. **Manual / visual QA**
   - Open `/board.html` on a 1080p display; confirm text is readable from 3 meters.
   - Verify gold highlighting on called parties is visually distinct.
   - Verify empty-state message when queue is cleared.
   - Confirm auto-refresh works without interaction for 2+ minutes.
   - Open board on a phone browser; confirm it renders (not optimized, but not broken).

4. **Privacy audit**
   - Inspect network tab on `/board.html` -- confirm no PII in any XHR response.
   - Confirm `BoardPartyDTO` type definition excludes PII fields at the type level.

---

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Reuse `GET /api/queue/state`** | Only returns aggregate counts, not per-party codes and statuses needed for the board. |
| **Reuse `GET /api/host/queue`** | Returns full PII (names, phone numbers) and requires host PIN authentication. Exposing it publicly would be a privacy violation. |
| **WebSocket / SSE for real-time push** | Adds infrastructure complexity (connection management, reconnection logic). 5-second polling is simple, sufficient for a wall display, and matches the existing polling pattern used by other pages. Can upgrade later if needed. |
| **Embed board in host page** | The host page is phone-optimized and PIN-gated. The board needs to be a standalone, unauthenticated, landscape-optimized page for a TV. |
| **Show names instead of codes** | Privacy concern -- customers may not want their name displayed publicly. Codes are opaque and short-lived, matching the existing diner-facing pattern. |
