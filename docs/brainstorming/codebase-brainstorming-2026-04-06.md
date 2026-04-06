# Codebase Brainstorming — 2026-04-06

## Currently Exists (evidence-backed)

### Data Layer
- `queue_entries` collection: code, name, partySize, phoneLast4, state, joinedAt, promisedEtaAt, calls[], removedAt/Reason, serviceDay (`src/types/queue.ts`)
- `settings` collection: avgTurnTimeMinutes single-doc (`src/services/settings.ts`)
- MongoDB singleton with index bootstrap (`src/core/db/mongo.ts`)

### Services
- join/list/remove/call/recall/status/state (`src/services/queue.ts`)
- Code generation SKB-XXX unambiguous alphabet (`src/services/codes.ts`)
- get/set avgTurnTime with bounds 1–60 (`src/services/settings.ts`)
- serviceDay partitioning in PT, time math (`src/core/utils/time.ts`)

### API (10 REST + 1 MCP)
- 3 public diner endpoints: state, join, status (`src/routes/queue.ts`)
- 7 PIN-gated host endpoints: login/logout/queue/remove/call/settings-get/settings-set (`src/routes/host.ts`)
- health + health/db (`src/routes/health.ts`)
- MCP JSON-RPC with file_issue tool (`src/mcp-server.ts`)

### UI
- Diner: SKB-branded join form + confirmation + called callout + call history (`public/queue.*`)
- Host: PIN gate + queue table + Call/Recall/Seated/No-show + turn-time knob (`public/host.*`)

### Infrastructure
- Azure App Service B1 + Cosmos DB for MongoDB (`.github/workflows/deploy.yml`)
- GitHub Actions CI/CD on push to master

### Tests
- 31 unit tests (codes, serviceDay, queue pure helpers, hostAuth HMAC, rateLimit)
- 11 integration tests (real MongoDB: join, remove, call, recall, position recompute, promised-time stability)

## Extension Points

1. **`removedAt + removedReason`** on every entry — historical turn-time data exists but is never read back
2. **`calls[]` array** — tracks every host ping; could trigger external notification on `$push`
3. **`phoneLast4`** stored but underused — expandable to full phone with consent for SMS
4. **`settings` single-doc** — trivially extensible with more operator knobs
5. **MCP tool registry** has only `file_issue` — can expose queue tools to AI agents
6. **`serviceDay` partition** — historical data accumulates daily, queryable for analytics
7. **`computeEtaMinutes` is pure** — easy to swap with a smarter model

## Could Be Built (filed as GitHub issues)

### Tier 1 — Builds on existing data, minimal new code

| # | Issue | Feature | Builds on | Effort |
|---|---|---|---|---|
| 1 | [#2](https://github.com/mathursrus/SKB/issues/2) | QR code at the door | `express.static` serves `public/` | Tiny |
| 2 | [#3](https://github.com/mathursrus/SKB/issues/3) | Auto-tuned avg turn time | `queue_entries.removedAt` + `settings.avgTurnTimeMinutes` | Small |
| 3 | [#4](https://github.com/mathursrus/SKB/issues/4) | Queue display board for TV | `listHostQueue()` + public endpoint pattern | Small |
| 4 | [#5](https://github.com/mathursrus/SKB/issues/5) | SMS notify on Call | `callParty()` + `calls[]` `$push` | Medium |
| 5 | [#6](https://github.com/mathursrus/SKB/issues/6) | End-of-day dashboard | `queue_entries` filtered by `serviceDay` | Small |

### Tier 2 — New capability on existing architecture

| # | Issue | Feature | Builds on | Effort |
|---|---|---|---|---|
| 6 | [#7](https://github.com/mathursrus/SKB/issues/7) | Party-size-aware ETA | `computeEtaMinutes()` pure function + `partySize` | Small |
| 7 | [#8](https://github.com/mathursrus/SKB/issues/8) | Wait-time widget for Google | `getQueueState()` already public | Tiny |
| 8 | [#9](https://github.com/mathursrus/SKB/issues/9) | Return customer recognition | `queue_entries` historical + localStorage | Small |

### Tier 3 — Larger new domain

| # | Issue | Feature | Builds on | Effort |
|---|---|---|---|---|
| 9 | [#10](https://github.com/mathursrus/SKB/issues/10) | Table management | `removeFromQueue()` seated transition | Med-Large |
| 10 | [#11](https://github.com/mathursrus/SKB/issues/11) | Pre-order while waiting | Confirmation card + party code | Large |
| 11 | [#12](https://github.com/mathursrus/SKB/issues/12) | Multi-location | `serviceDay` partition extensible to `locationId` | Medium |

## Architectural Improvements (housekeeping)

| Fix | Location | Effort |
|---|---|---|
| Extract `dbError` helper (DRY) | Duplicated in `src/routes/queue.ts` and `src/routes/host.ts` | Tiny |
| Formal architecture doc | 8 patterns in RFC but no `docs/architecture/architecture.md` | Small |
| Add `favicon.ico` | Suppresses console 404 on every page load | Tiny |

## Quality Gates
- [x] All "Currently Exists" items have file paths
- [x] No hypothetical functionality presented as real
- [x] All "Could Be Built" suggestions reference existing foundation
- [x] Clear distinction between current state and future possibilities
- [x] Each suggestion has a realistic implementation approach
