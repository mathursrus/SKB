# Issue #51, Phase B — Admin tabs + signature-dish editor

## Before

`public/admin.html` was a single long-scroll page with two top-level panels:

- `#admin-operations-panel` holding 6+ stacked cards: Service Debrief, Stage-Based
  Analytics, Door QR, IVR / Phone Entry, Restaurant Site, Website, Ask OSH (MCP).
- `#admin-staff-panel` with the Staff card.

The only nav was a two-button bar (Operations / Staff) — anything else was vertical
scroll. Owners had to scroll past Service Debrief to reach Website or MCP.

## After

Seven-tab workspace. Each panel is `<main class="admin-panel" id="admin-panel-<key>">`
and the nav is `<nav class="admin-tabs admin-tabs-workspace">` with one
`<button data-tab="<key>">` per tab.

| Tab | What lives there |
| --- | --- |
| Dashboard | Service Debrief stats grid, Stage-Based Analytics histograms |
| Site | Address, Weekly Hours, Public Host, IVR / Phone Entry |
| Website | Template picker (Saffron / Slate), Content editor (hero, about, contact, social, reservations), **Signature-dish editor** (3 rows: title + desc + 160x120 image preview with file picker) |
| Menu | Placeholder card. Owners can set `menuUrl` here; full JSON menu editor is deferred. |
| Staff | Existing staff + invite + pending-invites cards, owner-only (tab hidden for admin/host) |
| AI | Ask OSH (MCP) card — moved unchanged |
| Settings | Door QR routing (mode + menu + closed-message), **Device PIN** card with masked value and "Regenerate PIN" button (endpoint deferred — button posts to `api/host/regenerate-pin`; non-200 response surfaces a "coming soon" toast) |

### Tab behaviour

- Each panel lazy-loads its own data via `tabLoaders` on first activation — no
  panel fetches anything until the operator clicks it. This keeps the initial
  admin render fast.
- The last-active tab is persisted to `localStorage` under
  `skb:adminTab:<loc>` so reloads land operators back where they left off.
  Per-tenant so the key isn't shared across restaurants in the same browser.
- The Staff tab is shown only when `/api/me` reports `role=owner`. If an
  admin-role user previously stored `staff` as their last-active tab,
  `activateTab()` detects the hidden button and falls back to `dashboard`.
- The topbar wordmark ("OSH · OS for Hospitality") is retained per spec §5.

### Signature-dish editor (deliverable 4)

Three rows. Each row:

- `<input class="signature-dish-title">` title
- `<textarea class="signature-dish-desc">` description
- `<img class="signature-dish-preview">` 160x120 preview
- `<input class="signature-dish-file" accept="image/*">` file picker

On file pick the client reads the file as a DataURL via `FileReader`, splits
the `data:<mime>;base64,<bytes>` header off, and stashes a `{ mime, data }`
upload in `sigState[i].pendingUpload`. On **Save Website**, `buildKnownForPayload()`
constructs the `content.knownFor` array where each row's `image` is either:

- the existing `/assets/<slug>/dishes/<hash>.<ext>` URL string (row unchanged), or
- a `{ mime, data }` object (new upload), or
- `""` (user clicked Clear).

Rows with no title, no description, and no image are dropped client-side so we
don't send blank cards to the validator. The server (Phase A,
`src/services/siteAssets.ts`) persists any inline upload and rewrites
`content.knownFor[i].image` to the hashed URL before saving; the response's
`content.knownFor` is then fed back into `sigLoadFromContent` so the preview
slots reflect the persisted state.

## Files touched

| File | Δ |
| --- | --- |
| `public/admin.html` | Restructured into 7 panels; added signature-dish grid + Device PIN card + menu placeholder |
| `public/admin.js` | Rewrote tab switcher around `TAB_KEYS` + lazy `tabLoaders`; added signature-dish wire-up, menu URL save, PIN regen stub + toast |
| `public/styles.css` | Tab row now scrolls horizontally; added `.signature-dish-row` grid, `.admin-toast` toast, mobile tightening |
| `tests/unit/adminTabs.test.ts` | New — 18 assertions over the HTML + JS contract |
| `tests/ui/admin-tabs.ui.test.ts` | New — stdlib HTTP UI test (Playwright not a dep; stdlib path is simpler) |
| `package.json` | Adds `test:ui` script; `test:all` now chains it; `adminTabs` in default `test` |
| `docs/evidence/51-admin-tabs-evidence.md` | This doc |

## Not touched (per spec constraints)

- **`onboarding-overlay` DOM + logic** — Phase C will rebuild the wizard.
- **Ask OSH MCP card contents** — moved into the AI panel unchanged.
- **`skb_session` / `skb_host` cookies** — still honored.

## Deferred (out of scope for Phase B)

- **Full menu JSON editor.** Menu tab is a placeholder with just a `menuUrl`
  input. Owners get parity with the previous QR-card menu field; a proper
  category/item editor is a separate issue.
- **POST `api/host/regenerate-pin` endpoint.** The UI button exists, hits the
  endpoint, and falls back to a "Regenerate PIN — coming soon" toast on any
  non-200. Backend rotation logic is a follow-up. When it lands, the
  client-side code already reads `data.pin` off a successful response and
  surfaces it in the toast; no further client changes needed.
- **Playwright-based browser tests.** Playwright is not yet a project
  dependency and the spec permitted a stdlib-HTTP fallback. The UI suite
  spins up the real dev server and covers (1) signup → session →
  admin.html round-trip, (2) all 7 tabs present in the served HTML,
  (3) the signature-dish POST with a mixed URL/upload `knownFor` payload,
  (4) `/public-config` reflecting the persisted uploads, (5) Menu-tab
  URL save through `visit-config`.

## Verification steps

- `npm run typecheck` — clean
- `npm test` — unit suite including `adminTabs` passes
- `npm run test:ui` — admin-tabs UI suite passes (requires Mongo)
- `tests/unit/siteRenderer.test.ts` and `tests/unit/siteAssets.test.ts`
  (Phase A's 12+12) still pass untouched
