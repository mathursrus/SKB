# Asset checklist

App.json currently does NOT reference any asset files, so `expo start` and type checking succeed without them. Before running the first EAS production build, drop the following assets into `assets/` and uncomment the `image` paths in `app.json` plugin configuration.

## Required for EAS production build

| File | Size | Purpose | Notes |
|---|---|---|---|
| `assets/icon.png` | 1024×1024 | App icon | Flat (no transparency, no rounded corners — Apple applies the mask). Brand accent `#ffb347` on `#171a21` surface. |
| `assets/splash-icon.png` | 1024×1024 | Splash logo | Centered on `#171a21`. Uncomment `image` under `expo-splash-screen` plugin once this lands. |
| `assets/notification-icon.png` | 96×96 transparent PNG | Push notification icon | Uncomment `icon` under `expo-notifications` plugin once this lands. |
| `assets/adaptive-icon.png` | 1024×1024 | Android adaptive icon | Only needed if Android support is added; skipping for iOS-only. |

## Required for App Store Connect listing

| File | Size | Count | Purpose |
|---|---|---|---|
| iPad Pro 12.9" screenshot | 2048×2732 | 3–10 | See `APP_STORE_METADATA.md` §"Screenshots required" for the 5-screenshot shot list. |
| iPhone 6.7" screenshot | 1290×2796 | 3–10 | Same set in portrait. |
| App preview video (optional) | 1920×1080 .mov | 1 | 15–30s walkthrough. |

## Creating the assets

1. **Icon (1024×1024):** Figma/Sketch/any vector tool, export at 1x. Use the brand palette from `src/ui/theme.ts`: surface `#171a21`, accent `#ffb347`. A minimalist "SKB" monogram works. Apple does not allow a transparent background.
2. **Splash:** same visual on the surface color.
3. **Screenshots:** easiest path is to run the app in an iPad Pro 12.9" simulator, sign in with the demo PIN, seed staging data, and use Simulator → File → Screenshot (⌘S). For proper 2048×2732 exports, use `xcrun simctl io booted screenshot`. These need to be captured on a Mac or via a MacInCloud/EAS macOS build worker.

## Why assets aren't in git yet

This repo is Windows-origin and was scaffolded remotely. Asset creation is deferred to a design pass. The `.gitignore` does NOT exclude `assets/` — committing the final PNGs is expected.

## Unblocking the first EAS build

After dropping the asset files, re-add the `image` keys to `app.json`:

```diff
 "plugins": [
   ...
   [
     "expo-notifications",
     {
+      "icon": "./assets/notification-icon.png",
       "color": "#ffb347"
     }
   ],
   [
     "expo-splash-screen",
     {
       "backgroundColor": "#171a21",
+      "image": "./assets/splash-icon.png",
       "imageWidth": 200
     }
   ]
 ],
```

And add `"icon": "./assets/icon.png"` under the top-level `expo` block.
