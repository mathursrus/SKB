# Design Evidence — Issue #1 "Place in Line"

- Spec: `docs/feature-specs/1-place-in-line.md`
- RFC: `docs/rfcs/1-place-in-line.md`

## Summary
Technical design for the diner waitlist + host-stand queue view, built as Express REST routes + MongoDB on top of the existing MCP scaffold. Vanilla HTML/JS served from `public/`; no Next.js in v1.

## Work Completed
- Authored `docs/rfcs/1-place-in-line.md` covering data model, 8 API endpoints, test matrix, risks, and observability.
- Documented 8 architectural patterns introduced (missing from yet-to-be-created architecture doc).
- No spike needed (confidence 90/100).

### Traceability Matrix

| Requirement | RFC Section / Data Model | Status |
|---|---|---|
| R1 — Diner sees queue length + ETA, no auth | API: `GET /api/queue/state`; DTO: `{partiesWaiting, etaForNewPartyMinutes}` | Met |
| R2 — Diner joins with name, partySize (1–10), phoneLast4? | API: `POST /api/queue/join`; validation rules listed in RFC § API | Met |
| R3 — Confirmation returns position, ETA, code | API: `POST /api/queue/join` response `{code, position, etaAt, etaMinutes}`; `src/services/codes.ts` generates `SKB-XXX` | Met |
| R4 — Entry persists until removed or EOD reset | `QueueEntry.state ∈ {waiting, called, seated, no_show}` + `serviceDay` partition; EOD handled by query filter, not destructive reset | Met |
| R5 — Operator sees ordered list with per-party ETA | API: `GET /api/host/queue`; Service: `src/services/queue.ts` (list-by-serviceDay, ordered by joinedAt) | Met |
| R6 — Operator removes with reason | API: `POST /api/host/queue/:id/remove` body `{reason: "seated"\|"no_show"}`; stored on `QueueEntry.removedReason` | Met |
| R7 — ETAs recalculate after removal | ETA formula `position × avgTurnTimeMinutes` computed server-side on every read; no stored ETA to stale | Met |
| R8 — Diner view reflects updated ETA on refresh | API: `GET /api/queue/status?code=`; diner polls on page refresh | Met |
| R9 — Operator configures avg_turn_time (default 8) | API: `POST /api/host/settings`; `settings` collection single-doc model | Met |
| R10 — Host access requires PIN | API: `POST /api/host/login` compares `SKB_HOST_PIN` via `crypto.timingSafeEqual`; `middleware/hostAuth.ts` verifies HMAC-signed cookie | Met |
| NF1 — Mobile-first UI | `public/queue.html` single-column ≤600px; mocks at `docs/feature-specs/mocks/1-diner.html` | Met |
| NF2 — Clean and simple UI | Generic UI baseline constraints listed in RFC § Design Standards Applied | Met |
| NF3 — Minimal PII | Schema stores `phoneLast4?` only, never full phone; no payment; no third-party analytics | Met |

**Result: PASS** — all requirements Met, zero Unmet.

## Architectural Gaps for User Review
No project `architecture.md` exists. The RFC documents 8 patterns that should be promoted to `docs/architecture/architecture.md` after implementation via the `create-architecture` job:

1. Route modules under `src/routes/*.ts`
2. Service modules under `src/services/*.ts` (HTTP-unaware)
3. MongoDB singleton via `src/core/db/mongo.ts#getDb()`
4. Service-day partitioning (PT `YYYY-MM-DD`)
5. HMAC-signed cookie auth (`SKB_COOKIE_SECRET`)
6. Per-IP in-memory rate limiting
7. Timezone pinning (`TZ=America/Los_Angeles`)
8. Secrets via env only

## Validation
Traceability verified by matching every R# / NF# from spec against an RFC section or API/data-model element. No "Unmet" rows.

## Quality Checks
- [x] All spec requirements traced to design
- [x] Testing strategy defined (unit / integration / 1 e2e)
- [x] Risks + mitigations listed (6 rows)
- [x] Secrets handling explicit
- [x] No hand-waving ("use AI", "TBD") in the design
