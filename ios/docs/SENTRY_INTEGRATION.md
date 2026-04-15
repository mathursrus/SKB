# Sentry integration recipe

Follow this recipe once you have a Sentry DSN. Takes ~15 minutes of wall-clock time including the first release upload.

## 1. Install

```bash
cd ios
npx expo install @sentry/react-native
```

`@sentry/react-native` ships with an Expo config plugin that wires the native SDK into EAS builds automatically.

## 2. Config plugin

In `app.json`, add to `plugins`:

```json
"plugins": [
  ...,
  [
    "@sentry/react-native/expo",
    {
      "url": "https://sentry.io/",
      "project": "skb-host-stand-ios",
      "organization": "<your-sentry-org-slug>"
    }
  ]
]
```

## 3. Init at app startup

In `app/_layout.tsx`, add near the top:

```ts
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableAutoSessionTracking: true,
  tracesSampleRate: 0.1,
  enabled: !__DEV__,
});
```

And set `EXPO_PUBLIC_SENTRY_DSN` in each EAS build profile's `env` block in `eas.json`.

## 4. Hook the logger sink

In `src/core/logger.ts` (already has a sink registry), add a sink in the root layout effect:

```ts
logger.addSink((event) => {
  if (event.level === 'error') {
    Sentry.captureException(new Error(event.msg), {
      extra: event.data ?? {},
    });
  } else if (event.level === 'warn') {
    Sentry.captureMessage(event.msg, {
      level: 'warning',
      extra: event.data ?? {},
    });
  }
});
```

## 5. dSYM upload

The config plugin handles automatic dSYM upload during EAS build — no build-phase script needed. Verify after your first production build by checking Sentry → Settings → Debug Files for the uploaded dSYMs.

## 6. Test

Add a throwaway error boundary in dev:

```ts
// TEMP — remove before merging
throw new Error('Sentry test error');
```

Build a preview (`npm run eas:build:preview`), install on device, open the app, and verify the error lands in Sentry within 30 seconds. Then remove the temp throw.

## 7. Update compliance doc

Once Sentry is collecting crash data, `docs/COMPLIANCE.md §1` becomes inaccurate. Change the "Data Not Collected" declaration to:

- **Diagnostics > Crash Data**: Yes, for App Functionality, Not Linked to User, No Tracking.

And add Sentry to the App Store Connect → App Privacy → Data Types form with the same settings.
