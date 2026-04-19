# Issue #51 Phase D — Google Business Profile OAuth + sync

**Scope:** let a restaurant owner connect their Google Business Profile account
and make OSH the single source of truth for hours, phone, and description.
Changes saved in OSH fan out to Google automatically (website + IVR already
worked). All builds green on `feature/51-fully-multi-tenant-system`.

---

## What shipped

### New files

- **`src/services/googleBusiness.ts`** (~490 LOC). OAuth 2.0 (Authorization
  Code + PKCE), token persistence, refresh-on-401, `buildGbpPatchPayload`
  (OSH → GBP shape), `pushToGbp` / `pushToGbpBackground`, and the
  `toPublicGoogleToken` projection that guarantees `accessToken` and
  `refreshToken` never leave the module. Mirrors the `passwordHash`
  contract on `User`.
- **`src/routes/google.ts`** (~280 LOC). All `/r/:loc/api/google/*` routes,
  tenant-bound via `requireRole('owner', 'admin')`. Endpoints:
  - `GET  /google/status` — UI renderer driver (always 200; returns
    `credsConfigured` + `connected`).
  - `POST /google/oauth/start` — PKCE verifier in `skb_google_oauth` cookie,
    scoped to `/r/:loc/api/google/oauth/`. Returns `{ authUrl }`.
  - `GET  /google/oauth/callback` — public route, state bound to
    `:loc`, PKCE cookie validated against `sha256(state)`; on success
    redirects to `/r/:loc/admin.html?tab=settings&google=connected`.
  - `POST /google/disconnect` — revokes via Google + deletes the row.
  - `GET  /google/locations` — picker data for multi-location accounts.
  - `POST /google/link` — stores the chosen `locationResourceName`.
  - `POST /google/sync` — explicit push of hours/phone/description.
- **`tests/unit/googleBusiness.test.ts`** — 17 cases covering PKCE,
  auth-URL shape, mocked token exchange, refresh-on-401, OSH→GBP
  translation, and the "never-in-response" contract.
- **`tests/integration/google-oauth.integration.test.ts`** — 11 cases
  covering status / oauth-start / link / disconnect / cross-tenant.
- **`tests/ui/google-admin.ui.test.ts`** — 8 cases covering the Settings
  card DOM + cross-tenant.

### Changed files

- `src/core/db/mongo.ts` — `google_tokens` collection + `{ locationId: 1 }`
  unique index bootstrap.
- `src/mcp-server.ts` — mounts `googleRouter()` at `/r/:loc/api`.
- `src/routes/host.ts` — `pushToGbpBackground(loc)` fires from
  `/host/site-config` (when hours change), `/host/voice-config` (when
  phone changes), and `/config/website` + `/host/website-config` (when
  `content.about`/description changes). Fire-and-forget; a sync failure
  updates `google_tokens.lastSyncError` but never fails the admin save.
- `public/admin.html` — new "Google Business Profile" card in the Settings
  tab, beneath Door QR + Device PIN. Buttons: Connect, Sync now, Link this
  location, Disconnect.
- `public/admin.js` — `loadGoogleCard()` + `wireGoogleCard()`. Renders the
  five states (`creds_missing`, `not_connected`, `connected_single`,
  `connected_multi`, `error`), handles `?google=connected` /
  `?google=error=...` redirect query params.
- `package.json` — new tests wired into `test`, `test:integration`,
  `test:ui`.

---

## Data model

New collection: `google_tokens`.

```
{
  _id: ObjectId,
  locationId: string,          // unique
  accessToken: string,         // never in an API response
  refreshToken: string,        // never in an API response
  expiresAt: Date,
  accountId?: string,
  locationResourceName?: string,
  connectedAt: Date,
  connectedByUserId: ObjectId,
  lastSyncAt?: Date,
  lastSyncError?: string,
}
```

Index: `{ locationId: 1 }` unique — one row per tenant.

**Security note.** `refreshToken` is treated like `User.passwordHash`.
`toPublicGoogleToken()` strips both secret fields and every endpoint
projects through it. The integration + UI tests assert the fixtured
tokens never appear in status response bytes.

---

## Sid: what you need to do for live validation

You don't have Google Cloud credentials provisioned yet. When you do:

### 1. One-time Google Cloud project setup

1. Create (or select) a GCP project at https://console.cloud.google.com.
2. Enable these APIs:
   - **Google My Business Account Management API** (`mybusinessaccountmanagement.googleapis.com`)
   - **My Business Business Information API** (`mybusinessbusinessinformation.googleapis.com`)
3. Go to **APIs & Services → OAuth consent screen**. Pick "External",
   app name "OSH", support email = yours. Add these scopes:
   - `.../auth/business.manage`
   - `openid`
   - `email`
   - `profile`
   Add your Google account as a **Test user** (you'll connect from that
   account). Leave in "Testing" status — you don't need to publish for
   validation.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   Type: **Web application**. Authorized redirect URI:
   `https://skb-waitlist.azurewebsites.net/r/<slug>/api/google/oauth/callback`.
   For local testing, also add
   `http://localhost:3000/r/skb/api/google/oauth/callback`.
   Copy the client ID + client secret.

### 2. Environment variables on the server

Set on the Azure App Service (or local `.env`):

```
GOOGLE_CLIENT_ID=<from step 4>
GOOGLE_CLIENT_SECRET=<from step 4>
# Optional — only needed if you're behind a proxy that rewrites paths.
# Leave unset and OSH computes it from SKB_PUBLIC_BASE_URL + /r/:loc/....
GOOGLE_REDIRECT_URI=
```

If any of `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` is missing, the
admin Settings card shows **"Ask your OSH admin to configure Google
credentials"** and the Connect button is disabled. The rest of OSH
keeps working.

### 3. Live validation checklist

With creds provisioned and env vars set:

- [ ] Visit `/r/<slug>/admin.html?tab=settings`. The Google Business
      Profile card should render with "Connect Google Business"
      enabled.
- [ ] Click **Connect**. You'll be redirected to
      `accounts.google.com`, sign in with the test-user Google account,
      consent to the scopes.
- [ ] You should land back on
      `/r/<slug>/admin.html?tab=settings&google=connected`. The status
      line reads "Connected to Google Business." Card flips to the
      connected state.
- [ ] If your Google account owns **one** location on the account, the
      card shows **"Linked to: accounts/.../locations/..."** plus
      **Sync now** + **Disconnect**.
- [ ] If your Google account owns **multiple** locations, the card
      shows a dropdown. Pick one, click **Link this location**, verify
      the card flips to the single-linked state.
- [ ] Click **Sync now**. Expect a "Synced." status. Verify in Google:
      hours / phone / description on the GBP location match what you
      have in OSH (Site tab + Website tab).
- [ ] Edit OSH hours in the Site tab, click Save. Watch the server log
      for `gbp.sync.ok`. Verify in Google that the hours update within
      a minute.
- [ ] Edit the About text in the Website tab, click Save. Same
      expectation.
- [ ] Edit the Front Desk phone in the Voice tab, click Save. Same
      expectation.
- [ ] Click **Disconnect**. Confirm the prompt. Expect the card to
      return to the "not connected" state. In Google Account
      permissions (https://myaccount.google.com/permissions), verify
      OSH no longer appears.
- [ ] Cross-tenant probe: sign in as a different owner on a different
      restaurant. Hit
      `GET /r/<other-slug>/api/google/status` with the first owner's
      session cookie. Expect 403 `{"error":"wrong_tenant"}`. (This is
      already covered by the integration + UI test suites, but worth
      a live confirmation.)

### 4. Known limitations / deferrals

- **Wizard Phase C integration punted.** The inline onboarding wizard
  (`public/onboarding.js`) does not yet have a "Connect Google" step.
  The Settings card is the entry point for now. TODO marker:
  `public/onboarding.js` line range around `STEP_IDS`.
  Follow-up commit should add a step `'google'` between `'content'` and
  `'menu'`, mark it `SKIPPABLE: true`, and on the "You're live" screen
  show "Hours and description will sync to Google automatically" when
  connected.
- **Multi-account owners** (rare): v1 picks the first Google account
  only. If an owner owns multiple GBP accounts and needs to pick, we'd
  add a two-level picker. Parked until a real user hits this.
- **Verification / claim flow**: we assume the owner already verified
  their location on Google. If GBP returns a "location not verified"
  error during sync, it surfaces in `lastSyncError` and the card shows
  it. No in-product claim flow.
- **Publication to production OAuth consent**: you'll want to graduate
  from "Testing" to "In production" on the consent screen before
  non-test-user owners can connect. That's a Google review, typically
  1-3 days. Until then, add owners as test users.

---

## Test counts after Phase D

- `npm test` — 551 unit tests (534 pre-Phase-D + 17 new).
- `npm run test:integration` — pre-existing count + 11 new Google
  cases.
- `npm run test:ui` — pre-existing count + 8 new Google cases.
- `npm run typecheck` — clean.

---

## Diff stat (summary, from `git diff --stat master...HEAD` over the
Phase D commit)

See the commit `feat(51): Google Business Profile OAuth + hours/phone/description sync`
for the authoritative stat. Headline:

- 3 files added under `src/` (`services/googleBusiness.ts`,
  `routes/google.ts`).
- 3 test files added (`unit/googleBusiness`, `integration/google-oauth`,
  `ui/google-admin`).
- Edits to `src/core/db/mongo.ts`, `src/mcp-server.ts`, `src/routes/host.ts`,
  `public/admin.html`, `public/admin.js`, `package.json`.
- 1 doc added: this file.
