# Asset checklist

`app.json` references all four files below, and they exist in `assets/`. Build is unblocked. The current PNGs are placeholders (icon, splash, and adaptive are byte-identical) — replace with real designed assets before final public launch to reduce App Review 4.0/4.3 risk.

> **2026-04 note:** `icon.png` was originally exported as RGBA. Apple's ITMS validator rejects iOS app icons with an alpha channel, so it has been flattened onto the brand surface color (`#171a21`) and re-saved as 8-bit RGB. The pre-flatten file lives in git history if you need to recover it. When designing the real icon, export it WITHOUT transparency.

## Required for EAS production build

| File | Size | Purpose | Notes |
|---|---|---|---|
| `assets/icon.png` | 1024×1024 RGB (no alpha) | App icon | Flat, no transparency, no rounded corners — Apple applies the mask. Brand accent `#ffb347` on `#171a21`. |
| `assets/splash-icon.png` | 1024×1024 | Splash logo | Centered on `#171a21`. Wired in `expo-splash-screen` plugin. |
| `assets/notification-icon.png` | 96×96 transparent PNG | Push notification icon | Wired in `expo-notifications` plugin. Transparency IS allowed here. |
| `assets/adaptive-icon.png` | 1024×1024 | Android adaptive icon | Present but unused on iOS. |

## Required for App Store Connect listing

| File | Size | Count | Purpose |
|---|---|---|---|
| iPad Pro 12.9" screenshot | 2048×2732 | 3–10 | See `APP_STORE_METADATA.md` §"Screenshots required" for the 5-screenshot shot list. |
| iPhone 6.7" screenshot | 1290×2796 | 3–10 | Same set in portrait. |
| App preview video (optional) | 1920×1080 .mov | 1 | 15–30s walkthrough. |

## Creating the assets

1. **Icon (1024×1024):** Figma/Sketch/any vector tool, export at 1x. Use the brand palette from `src/ui/theme.ts`: surface `#171a21`, accent `#ffb347`. The current icon is a bold "OSH" wordmark — when refining, keep the contrast and avoid a transparent background (Apple rejects icons with alpha).
2. **Splash:** same visual on the surface color.
3. **Screenshots:** easiest path is to run the app in an iPad Pro 12.9" simulator, sign in with the demo PIN, seed staging data, and use Simulator → File → Screenshot (⌘S). For proper 2048×2732 exports, use `xcrun simctl io booted screenshot`. These need to be captured on a Mac or via a MacInCloud/EAS macOS build worker.

## Why assets aren't in git yet

This repo is Windows-origin and was scaffolded remotely. Asset creation is deferred to a design pass. The `.gitignore` does NOT exclude `assets/` — committing the final PNGs is expected.

## Unblocking the first EAS build

Already done — `app.json` references `./assets/icon.png` at the top level, `./assets/splash-icon.png` under the `expo-splash-screen` plugin, and `./assets/notification-icon.png` under `expo-notifications`. No further config changes needed.
