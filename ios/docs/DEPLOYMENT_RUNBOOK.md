# Deployment runbook

This runbook covers taking `skb-host-stand-ios` from the current state (EAS project linked, code ready) to a TestFlight build. You must run the interactive commands yourself — Apple credential setup cannot be driven from this environment.

## Current state

- ✅ EAS project created: `@smathur97/skb-host-stand-ios` (ID `daea0683-3bd3-4e56-8b49-0bda8be60ddf`)
- ✅ Bundle identifier: `com.skbwaitlist.hoststand`
- ✅ `eas.json` profiles: development / preview / production
- ✅ Typecheck clean, 17/17 tests green
- ❌ iOS distribution credentials (cert + provisioning profile) — pending first interactive build
- ❌ Asset PNGs — pending design pass (see `ASSETS.md`)
- ❌ Apple Team ID + ASC App ID in `eas.json` submit profile

## Prerequisites checklist

Before running any command below:

- [ ] You have a paid **Apple Developer Program** membership tied to `sid.mathur@gmail.com` (or another Apple ID you'll use at the prompt).
- [ ] You know your Apple Team ID (Apple Developer portal → Membership).
- [ ] You have `assets/icon.png` (1024×1024, flat, no transparency) and `assets/splash-icon.png` in place, and have re-added the `image` references to `app.json` per `ASSETS.md`. Without these the build will fail.
- [ ] If you plan on device testing via preview profile, your iPhone/iPad UDID is registered in the Apple Developer portal, OR be ready for EAS to register it interactively.

## Step 1 — First interactive iOS build

Open a **new terminal window** (PowerShell or Git Bash) in `C:\Users\sidma\Code\SKB\ios` and run:

```bash
npx eas-cli build --profile preview --platform ios
```

This will prompt you to:

1. **Apple Developer account login.** Enter your Apple ID + password. Two-factor auth supported.
2. **Select Apple Team.** Pick the team that owns `com.skbwaitlist.hoststand`.
3. **Generate distribution certificate.** Choose "Let EAS manage credentials."
4. **Generate provisioning profile.** Choose ad-hoc for internal distribution. EAS will ask if it should register new UDIDs — if your test device isn't already in the portal, say yes and paste the UDID when asked (get it from Settings → General → About → scroll to "Identifier" on-device, or from Finder with the device plugged in).
5. **Build starts on EAS cloud.** ~15-25 minutes. You can close the terminal; the build continues in the cloud.

Watch progress at: https://expo.dev/accounts/smathur97/projects/skb-host-stand-ios/builds

Once the build finishes you'll get an `.ipa` download link. Install on device via:

- **EAS QR:** scan the QR from the build page on your iPhone/iPad.
- **TestFlight preview:** requires extra config — skip for first build.
- **Sideload via Apple Configurator 2:** requires a Mac.

## Step 2 — Fill in the submit profile

Before running `eas submit`, edit `eas.json` and replace:

```json
"submit": {
  "production": {
    "ios": {
      "ascAppId": "REPLACE_WITH_APP_STORE_CONNECT_APP_ID",
      "appleTeamId": "REPLACE_WITH_APPLE_TEAM_ID"
    }
  }
}
```

- **appleTeamId:** your 10-character Apple Developer team identifier.
- **ascAppId:** create the app listing at https://appstoreconnect.apple.com (My Apps → + → New App), using bundle `com.skbwaitlist.hoststand`, primary language English, SKU `skb-host-stand-ios`. Copy the App ID (looks like `1234567890`) into `eas.json`.

## Step 3 — Production build + TestFlight submit

```bash
npx eas-cli build --profile production --platform ios
npx eas-cli submit --profile production --platform ios --latest
```

The submit step uploads the build to App Store Connect and routes it to TestFlight's "Internal Testing" group. Expect ~5-15 minutes for Apple's initial processing.

## Step 4 — Declare export compliance and privacy

In App Store Connect:

1. **Export Compliance** — already auto-handled by `ITSAppUsesNonExemptEncryption: false` in `app.json`. No prompt expected.
2. **App Privacy** — go to App Privacy and select "Data Not Collected." Justification lives in `COMPLIANCE.md §1`.
3. **Content Rights** — set to "No third-party content."
4. **Age Rating** — answer all "No" and publish as **4+**.

## Step 5 — Invite testers

App Store Connect → TestFlight → Internal Testing → add testers by Apple ID. Internal testers need to be on your Apple Developer team. Build goes live for them within minutes after processing completes.

## Troubleshooting

- **`credentials error: unable to find team`:** you didn't select a team during interactive login, or your Apple Developer account isn't on a paid program. Fix: enroll and rerun.
- **`Build failed: Missing icon`:** asset PNGs not in place. Drop `icon.png` in `assets/` and re-add the references per `ASSETS.md`, then re-run.
- **`Prebuild failed: Unable to resolve module expo-updates`:** already handled — expo-updates is now in `package.json`. If you see it again, run `npm install` in the `ios/` folder.
- **`buildNumber is ignored when version source is set to remote`:** already fixed — `buildNumber` has been removed from `app.json`. EAS auto-increments via `cli.appVersionSource: remote` in `eas.json`.
- **Build stuck in "Queued" for >30 min:** free EAS tier has limited concurrent builds; check https://expo.dev/accounts/smathur97/settings/billing or wait.

## Rollback

- **Cancel an in-flight build:** `npx eas-cli build:cancel <buildId>` or the "Cancel" button on the build page.
- **Revoke a TestFlight build:** App Store Connect → TestFlight → select build → Expire Build.
- **Restore placeholder eas.json/app.json:** `git checkout -- ios/app.json ios/eas.json` (but the EAS `projectId` is the only mutation worth preserving; do NOT restore that placeholder).
