# SKB Host Stand iOS — Observability

## 1. Logger

`src/core/logger.ts` exports a minimal structured logger with:

- Severity levels: `debug` / `info` / `warn` / `error`
- JSON payloads written to `console.*` so they flow into:
  - **Dev:** Metro bundler console and Safari Web Inspector
  - **TestFlight/prod:** Apple's system log (visible via Console.app or `idevice_id`-based tools)
- Pluggable sink registry (`logger.addSink(fn)`) so a Sentry/Datadog/PostHog sink can be added without touching call sites.
- `events` enum of canonical event names (`auth.login.attempt`, `seat.confirm`, `chat.send`, etc.) to prevent name drift.

## 2. Future sinks (Phase 11)

| Vendor | Integration | Gating |
|---|---|---|
| **Sentry** | `@sentry/react-native` auto-init, wrapped in `logger.addSink` | Requires Sentry DSN + Sentry org/project in EAS env vars. Deferred. |
| **Expo Updates error telemetry** | Built-in via expo-updates, no code needed | Enabled automatically once OTA channel is live in Phase 11. |
| **Server-side log ingest** | Batched POSTs to a `/host/client-logs` endpoint | Endpoint does not exist in SKB backend yet. |

## 3. Analytics events

The `events` dictionary in `logger.ts` is the source of truth for product analytics. Any new user-visible interaction should add its name here so:
- Dashboards can be built against a stable vocabulary.
- Event names don't drift (`chat_send` vs `chat.send`).
- Changes are traceable in git blame for a single file.

## 4. Crash reporting

**Not wired yet.** Expo SDK 52 ships with expo-updates / expo-error-recovery hooks; real crash reporting will be added in Phase 11 via `@sentry/react-native` once the user provides a Sentry DSN. Until then, crash state surfaces through:
- iOS Console.app via the exception logs Apple collects automatically.
- App Store Connect → TestFlight → Crashes (available only after TestFlight uploads begin).

## 5. Performance tracing

Deferred. `React Native Performance` APIs are used implicitly (Reanimated worklets, Flatlist windowing) but no explicit tracing is wired. Real perf tracing will land in Phase 11 alongside crash reporting.
