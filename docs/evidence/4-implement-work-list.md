# Issue #4 — Queue Display Board: Implementation Work List

## Issue Type: Feature

## Scope Summary
Add a public TV-optimized queue display board at `/board` backed by a new public API endpoint `GET /api/queue/board`. The board polls every 5 seconds and shows party codes + status (Waiting/Called) with no PII.

## Implementation Checklist

### Backend — New API Endpoint
- [x] `src/types/queue.ts` — Add `BoardEntryDTO` interface: `{ position: number; code: string; state: string }`
- [x] `src/services/queue.ts` — Add `getBoardEntries(now?: Date)` function: queries today's active (waiting+called) parties ordered by `joinedAt`, returns array of `{ position, code, state }` only (no PII)
- [x] `src/routes/queue.ts` — Add `GET /queue/board` route handler (public, no auth) that calls `getBoardEntries()` and returns JSON array

### Frontend — Board Page
- [x] `public/board.html` — Production board page based on mock at `docs/feature-specs/mocks/4-board.html`, with JS polling `GET /api/queue/board` every 5 seconds
- [x] `public/board.js` — Board polling logic: fetch, render grid, handle empty state, handle network errors (retain last data), update clock

### Tests
- [x] `tests/board.integration.test.ts` — Integration tests for `getBoardEntries()`:
  - Returns only `position`, `code`, `state` fields (no PII leakage)
  - Filters to current service day only
  - Filters to active states (waiting + called) only
  - Orders by joinedAt ascending
  - Returns empty array when no entries
  - Handles mixed waiting/called states correctly

## Discovered Codebase Patterns

### Environment Variables
- `MONGODB_URI` — MongoDB connection string (default: `mongodb://localhost:27017`)
- `PORT` / git-branch-based port via `getPort()` in `src/core/utils/git-utils.ts`

### Architecture Patterns
- **Routes**: Express Router factory functions in `src/routes/`, mounted on `/api` prefix in `mcp-server.ts`
- **Services**: Business logic in `src/services/`, called by route handlers
- **Types**: DTOs and domain types in `src/types/queue.ts`
- **DB**: Singleton MongoDB via `src/core/db/mongo.ts` with `getDb()` + typed collection accessors
- **Static files**: `public/` served by `express.static` — board.html goes here
- **Error handling**: Routes use local `handleDbError()` / `dbError()` helper returning 503
- **Service day**: `serviceDay()` from `src/core/utils/time.ts` partitions data by PT calendar day
- **Active states**: Constant `ACTIVE_STATES = ['waiting', 'called']` already defined in queue service

### Existing Utilities to Reuse
- `serviceDay(now)` — get today's date string in PT
- `queueEntries(db)` — typed MongoDB collection accessor
- `getDb()` — get database connection
- `ACTIVE_STATES` — `['waiting', 'called']` (currently module-private, can duplicate or export)

### UI Patterns
- Brand palette: Black + White + Gold (#e3bf3d), Fira Sans typography
- Mock HTML at `docs/feature-specs/mocks/4-board.html` provides the complete design
- Existing pages: `queue.html` (diner), `host.html` (host operator)
- JS files are separate from HTML: `queue.js`, `host.js`

## Validation Requirements

- **uiValidationRequired**: true — board page is a new UI surface
- **mobileValidationRequired**: false — board is TV/landscape optimized, not mobile-targeted
- **browserValidationRequired**: true — must render correctly in Chromium at 1920x1080
- **Target journeys**: Load /board with queue entries, verify Called highlighting, verify empty state, verify auto-refresh, verify network resilience
- **Required breakpoints**: 1920x1080 (primary TV), 960px+ (responsive fallback)
- **Evidence artifact**: `docs/evidence/4-ui-polish-validation.md`

## Deferrals / Open Questions
- Auto-scrolling for 20+ parties: implement basic 2-column grid as in mock; auto-scroll can be a follow-up if needed
- Pulse animation on state change: included in CSS mock, will carry forward
- No RFC/design doc exists for this issue; spec is the source of truth
