# Post-launch monitoring playbook

## 1. What to watch (from Issue #30 spec §7)

| Metric | Source | Pre-launch baseline | Expected direction | Watchdog threshold |
|---|---|---|---|---|
| Avg `Waiting → Seated` time | SKB backend analytics | Whatever the web host stand reports today | Flat | ±20% deviation triggers investigation |
| No-show rate on parties that opened the waitlink | SKB backend + client `waitlist.poll` count | Current no-show rate | ↓ | No-show rate up instead of down → rollback `customer_waitlist_view_v1` (out of scope for this app) |
| Ratio of `chat.send` / `sms.custom.send` | Client `logger` events | 0 (feature is new) | Chat dominates (>2×) | Chat < Custom SMS → UX investigation |
| % of Seated rows with `tableNumber` populated | SKB `host/dining` response | 0% | → 100% after feature-flag on | <95% after 48h → investigate refuse-to-enter flows |
| Average `seat.dialog.open` → `seat.confirm` latency | Client `logger` timestamps | N/A | <5s median | >15s median → UX investigation |
| `seat.conflict.override` count / day | Client `logger` warn-level events | N/A | Low | >3 overrides/day at one location → investigate collision model |

## 2. Alerts

Until Sentry is wired (Phase 11 blocker), alerts run manually off the SKB backend's existing log stack. When Sentry lands, configure these Sentry Alerts:

| Rule | Condition | Severity | Owner |
|---|---|---|---|
| Crash spike | `crashFreeSessions < 99%` over 1h | Page | oncall |
| Login failure spike | `auth.login.failure > 10 in 5m` per device | Ticket | oncall |
| Poll error spike | `waitlist.poll.error > 5 in 1m` per device | Ticket | oncall |
| Seat confirm error spike | `seat.confirm error` >5% over 15m | Ticket | oncall |

## 3. Feature-flag rollout gates (per spec §7)

The web client has three Issue #30 flags; the iOS app mirrors them:

| Flag | What it gates in this app | Rollout plan |
|---|---|---|
| `host_row_chat_call_v1` | Chat + Call buttons in `RowActions.tsx` | Dark launch to 1 pilot location for 3 days → 10% → 100% |
| `seat_table_capture_v1` | Seat dialog (replaces instant-seat behavior) | Dark launch at 1 pilot, compare `tableNumber` population rate against kill criterion (see §4) |
| `customer_waitlist_view_v1` | Not applicable to this app (customer view is web-only) | — |

Flags live on the SKB backend; the iOS client reads them via `GET /host/settings` (existing endpoint). A follow-up task wraps the `Chat`, `Call`, and `Seat` buttons in a `useFeatureFlag()` hook that defaults to `off` until the response includes the flag.

## 4. Kill criteria

Directly from spec §7:

1. **`customer_waitlist_view_v1`**: if customer-view polling drives gateway cost > 2× current, switch to SSE before GA. N/A to this app.
2. **`host_row_chat_call_v1`**: no hard kill criterion. If the `chat.send`/`sms.custom.send` ratio stays below 1.0 after 14 days, revisit the UX (not a rollback).
3. **`seat_table_capture_v1`**: if the full-list design produces a single PII complaint (customer view), fall back to "ahead of you only" (OQ1). N/A to the host stand itself, but a broader rollback would take the flag globally off, disabling the Seat dialog on iOS. App must gracefully degrade — today it does not (the Seat button has no fallback). Flagged for Phase 11 follow-up.

## 5. User feedback channels

- **Host staff direct line:** the host can reach SKB operations via the existing in-host-stand messaging (out of scope for this app — operations monitors a separate Slack channel).
- **TestFlight feedback:** once on TestFlight, internal testers can attach screenshots + text via Apple's built-in feedback UI. These land in App Store Connect → TestFlight → Feedback.
- **App Store reviews:** deferred — app is distributed internal-only in v1, no public reviews expected.

## 6. Maintenance plan

| Cadence | Task |
|---|---|
| Weekly | Review `expo-updates` OTA channel (`preview` and `production`) for pending releases. |
| Weekly | Check EAS build queue + expired Apple certs (Apple distribution certs last 1 year). |
| Monthly | Upgrade `expo` minor versions via `npx expo install --fix`; re-run typecheck + tests. |
| Monthly | Review SKB backend contract for new endpoints that this app should surface. |
| Quarterly | Regenerate icon/splash if the SKB brand shifts. |
| Quarterly | Review privacy manifest accuracy vs. current native modules. |
| As needed | Rotate Apple distribution cert before expiry — EAS handles this on next build if you pass `--clear-cache`. |

## 7. Outstanding work after v1 ships

- [ ] Wire `@sentry/react-native` once DSN is available (`docs/OBSERVABILITY.md` has the integration point).
- [ ] Wrap feature-flagged actions in a `useFeatureFlag()` hook so the backend can kill-switch.
- [ ] Add `@testing-library/react-native` + snapshot tests for `SeatDialog` and `ChatSlideOver`.
- [ ] Generate real icon + splash + screenshots (see `ASSETS.md`).
- [ ] File the backend dependency: `POST /host/queue/:id/seat` and `tableNumber` in Party DTO.
