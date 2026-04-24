# OSH — iOS

React Native (Expo) app for OSH. The binary is generically branded as `OSH`, then brands itself per restaurant after login. It now supports staff login, role-aware routing, and a guest queue view alongside the host waitlist flow.

## Stack

- **Expo SDK 52** + React Native 0.76 (new architecture)
- **expo-router** filesystem routing
- **TypeScript** strict mode
- **EAS Build** for cloud iOS builds (works from Windows)

## Quick start

```bash
cd ios
npm install
npm start                  # Metro bundler
npm run ios                # open iOS simulator (requires Mac) OR scan QR from Expo Go
```

## Building for device / TestFlight (from Windows)

```bash
npx eas login              # first time
npx eas build:configure    # first time (fills in the EAS projectId)
npm run eas:build:dev      # development client for iOS simulator
npm run eas:build:preview  # ad-hoc IPA for on-device testing
npm run eas:build:prod     # production build
npm run eas:submit:prod    # submit to App Store Connect
```

## Configuration

The backend base URL is read from `EXPO_PUBLIC_API_BASE_URL`. Per-profile defaults live in `eas.json`. For local dev, copy `.env.example` to `.env` and point it at your running SKB server (`http://localhost:3000`).

## Bundle identifier

`com.skbwaitlist.hoststand`

## Layout

```
app/                   expo-router routes
  _layout.tsx          root stack
  index.tsx            placeholder home — replaced in Phase 3
src/
  ui/theme.ts          design tokens (mirrors host-stand dark theme)
```

## Status

All 11 phases of the FRAIM `ios-app-development` job have been run against this project (Issue #30). Per-phase detail is in `docs/`:

| Phase | Status | Document |
|---|---|---|
| 1. project-setup | ✅ | this README |
| 2. architecture-design | ✅ | `docs/ARCHITECTURE.md` |
| 3. core-implementation | ✅ | Issue #30 R9–R19 shipped |
| 4. integration-setup | ✅ | push + deep linking scaffolded |
| 5. performance-optimization | ✅ | shared 1hz clock + memoized rows |
| 6. compliance-validation | ✅ | `docs/COMPLIANCE.md` |
| 7. observability-setup | ✅ | `docs/OBSERVABILITY.md` + `src/core/logger.ts` |
| 8. app-store-preparation | ✅ | `docs/APP_STORE_METADATA.md` + `docs/ASSETS.md` |
| 9. deployment-review | ✅ | user approved |
| 10. deployment | 🟡 **interactive handoff** | `docs/DEPLOYMENT_RUNBOOK.md` |
| 11. monitoring-setup | 🟡 **docs only** | `docs/MONITORING_PLAYBOOK.md` + `docs/SENTRY_INTEGRATION.md` |

Phases 10 and 11 are partial because they need real Apple Developer credentials and a Sentry DSN that the automation can't mint. The runbooks cover every remaining manual step.
