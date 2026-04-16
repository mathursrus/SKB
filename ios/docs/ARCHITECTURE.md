# SKB Host Stand iOS — Architecture

**Scope:** Staff-facing iOS app (iPad primary, iPhone secondary) for the SKB restaurant host stand. Implements Issue #30 requirements R9–R18 on top of the existing SKB Express backend.

## 1. Layers

```
app/                    expo-router filesystem routes (view layer)
  (host)/_layout.tsx    tab layout: Waiting / Seated / Settings
  (host)/waiting.tsx
  (host)/seated.tsx
  (host)/settings.tsx
  login.tsx
src/
  core/                 domain types, pure functions, invariants
    party.ts            Party, PartyState, TableNumber types
    waitlist.ts         sort/filter/derive helpers (pure)
  net/                  HTTP + realtime transport
    client.ts           fetch wrapper with cookie auth + base URL
    endpoints.ts        typed endpoint functions (host API only)
    poll.ts             15s polling hook w/ backoff + pause-on-background
  state/                React Query-like store (zustand + custom hooks)
    useWaitlist.ts
    useChatThread.ts
    useAuth.ts
  features/
    waiting/            Waiting tab components
    seated/             Seated tab components
    chat/               Chat slide-over
    seat-dialog/        Seat Party dialog (R14–R17)
  ui/                   design system primitives
    theme.ts
    Button.tsx
    Badge.tsx
    Dialog.tsx
    SlideOver.tsx
```

## 2. State management

We use **Zustand** for client state + a thin polling layer rather than React Query, because (a) the host API is entirely cookie-authenticated and session-scoped, (b) we need identical poll cadence across tabs (one poll, many readers), and (c) the full state graph fits in a single store.

- `useWaitlistStore` — waiting parties, seated parties, lastPolledAt
- `useChatStore` — threadId → messages, unread counts per party
- `useAuthStore` — login state, cookie presence, location id, host pin

Polling is owned by a root `<PollHost/>` component mounted once in `(host)/_layout.tsx`. It calls `GET /host/queue`, `GET /host/dining`, and for every waiting party with an open chat thread `GET /host/queue/:id/chat`. Cadence is 15s (matches spec §3.1 R5). Paused while app is backgrounded via `AppState`.

## 3. Navigation

Login-gated routes use an expo-router route group `(host)/` with a layout that checks `useAuthStore.isAuthenticated`; unauthenticated users are redirected to `/login`.

```
/login           PIN entry
/(host)/waiting  Waiting tab (default after login)
/(host)/seated   Seated tab
/(host)/settings ETA mode, location id, logout
```

Within `(host)/waiting`, tapping a row opens a **presentation modal** (`/(host)/party/[id]`) for the Seat dialog, and a right-edge slide-over for Chat (own component, not a route).

## 4. Backend contract

Backend base URL from `process.env.EXPO_PUBLIC_API_BASE_URL` + location prefix `/r/:loc`, where `:loc` is from `EXPO_PUBLIC_LOCATION_ID` (default `skb`).

### Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/host/login` | `{ pin }` | Sets `skb_host` cookie (HttpOnly). |
| POST | `/host/logout` | — | Clears cookie. |

### Waitlist
| Method | Path | Purpose |
|---|---|---|
| GET | `/host/queue` | Waiting parties (source of truth for Waiting tab) |
| GET | `/host/dining` | Seated parties |
| GET | `/host/completed` | Historical |
| GET | `/host/queue/:id/timeline` | Audit trail |
| POST | `/host/queue/:id/remove` | No-show / Remove |
| POST | `/host/queue/:id/advance` | Transition: `ordered` / `served` / `checkout` / `departed` |

### Chat
| Method | Path | Purpose |
|---|---|---|
| GET | `/host/chat/templates` | Canned quick replies |
| GET | `/host/queue/:id/chat` | Fetch thread |
| POST | `/host/queue/:id/chat` | Send SMS |
| PATCH | `/host/queue/:id/chat/read` | Clear unread badge |

### Call
| Method | Path | Purpose |
|---|---|---|
| POST | `/host/queue/:id/call` | Server-initiated call |
| POST | `/host/queue/:id/call-log` | Log a device dial (used by iOS `Linking.openURL('tel:')`) |

### Stats / settings
| Method | Path | Purpose |
|---|---|---|
| GET | `/host/stats` | Avg turn time, totals |
| GET | `/host/analytics` | Analytics range |
| GET | `/host/settings` | ETA mode, avgTurnTimeMinutes |
| POST | `/host/settings` | Update ETA mode |

### ⚠︎ Backend gap — Issue #30 R14–R17
The current `/host/queue/:id/advance` accepts `state ∈ {ordered, served, checkout, departed}` but does NOT accept `table_number`, and there is no `seat` target state. Issue #30 requires a seat transition that captures a table number and checks for conflicts.

**Assumed backend contract after Issue #30 lands** (iOS app codes against this; backend delivery blocks iOS Phase 4 integration):

```http
POST /r/:loc/host/queue/:id/seat
Body: { "tableNumber": 12, "override": false }

200 OK   { "ok": true, "tableNumber": 12 }
409      { "error": "table_occupied", "tableNumber": 12, "byPartyId": "...", "byPartyName": "Kim" }
400      { "error": "invalid_table_number" }
```

And the `party` object returned by `/host/queue` and `/host/dining` MUST include `tableNumber: number | null`.

## 5. Realtime strategy

v1: **polling only**, 15s cadence, server-side rate-limited at 1 req / 5s / session (matches R20 of the web spec, reused here). If gateway cost becomes a problem, migrate to SSE reading from the same `/host/queue` endpoint upgraded with `Accept: text/event-stream`. The polling layer is isolated behind `src/net/poll.ts` so this swap is local.

## 6. Concurrency

All network calls go through `src/net/client.ts`. Requests carry the cookie automatically (React Native fetch with `credentials: 'include'` and a shared `Cookie` jar we manage manually since `expo-sqlite`-backed cookie persistence is not guaranteed on iOS). Mutations use **optimistic updates** with rollback on error, because host staff tap Seat / Call / Chat dozens of times per shift and cannot wait on round-trip latency.

## 7. Accessibility

All interactive controls carry explicit `accessibilityLabel` and `accessibilityRole`. Row action buttons (Seat, Notify, Chat, Call, Custom SMS, Custom Call, Remove) are keyboard-reachable on iPad with hardware keyboard, per R19.

## 8. Testing strategy

- **Unit:** pure functions in `src/core/` tested via Jest (`jest-expo` preset).
- **Component:** React Testing Library + `@testing-library/react-native` for feature components.
- **E2E:** deferred to Phase 5 — Detox on iOS simulator (requires Mac); until then, manual smoke tests against a running SKB server.

## 9. Non-goals for this app (v1)

- Customer-facing `/w/<token>` view (scope call = host stand only).
- Two-way chat UI polish beyond R10 requirements.
- Floor plan / table map.
- Reservations.
