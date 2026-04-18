# Issue #56 — Implementation Work List

**Scope:** Per-restaurant website template system. Adds a new `slate` template, a `websiteTemplate` choice on Location, a structured `content` override object, a server-side template router for `/r/:loc/{,menu,about,hours,contact}`, and a Website tab on admin.html. Independent of sub-issues 51a–51d.

**Parent spec:** `docs/feature-specs/51-fully-multi-tenant-system.md` §7, §8.2, §8.5.
**Mocks:**
- `docs/feature-specs/mocks/51-public-template-gallery.html` (side-by-side of saffron vs slate).
- `docs/feature-specs/mocks/51-admin-brand-staff.html` (Website tab + staff tab; only Website tab is in scope for #56).

**Branch:** `feature/56-website-template-system` off `feature/51-fully-multi-tenant-system`.

---

## Checklist

### Data model + server

- [ ] `src/types/queue.ts` — add `websiteTemplate?: 'saffron' | 'slate'` and `content?: LocationContent` fields on `Location`.
- [ ] `src/types/queue.ts` — define `LocationContent` type: `{ heroHeadline?, heroSubhead?, knownFor?: Array<{title, desc, image}>, about?, contactEmail?, instagramHandle?, reservationsNote? }`.
- [ ] `src/services/locations.ts` — add `updateLocationWebsiteConfig(locationId, { websiteTemplate?, content? })` with validation: template must be one of the two keys; content fields max lengths enforced; `knownFor` max 3 items.
- [ ] `src/services/locations.ts` — add `validateWebsiteConfigUpdate` pure validator for unit testing.
- [ ] `src/routes/host.ts` — add `GET /host/website-config` (role=host, parity with site-config) returning `{ websiteTemplate, content }`.
- [ ] `src/routes/host.ts` — add `POST /host/website-config` updating template + content. Per the spec §8.5 the canonical endpoint is `POST /r/:loc/api/config/website` owner+admin; v1 piggybacks on `requireHost` since named roles don't exist yet (added in sub-issue 51b) — route is registered at both `/host/website-config` (admin-UI consumer, authenticated) and `/config/website` (spec alias that proxies to the same handler) so it is forward-compatible when 51b ships.
- [ ] Expose website config on the public endpoint — extend `toPublicLocation` + `GET /public-config` to return `{ websiteTemplate, content }` so the rendered pages can pick up overrides at request time. Absent fields fall back to template defaults client-side.

### Template assets

- [ ] Introduce `public/templates/{saffron,slate}/` directories each containing `home.html`, `menu.html`, `about.html`, `hours-location.html`, `contact.html`, and `site.css`.
- [ ] Saffron template: use the existing `public/home.html`/`about.html`/`contact.html`/`hours-location.html`/`menu-page.html` + `public/site.css` verbatim as the saffron template baseline (so the SKB look is byte-identical for R1).
- [ ] Slate template: new files, palette per mock (cool off-white `#f4f6f4`, teal `#1f6a5d`, Archivo SemiCondensed + IBM Plex Sans). Same DOM IDs as saffron so `site-config.js` continues to populate brand/address/hours/contact without a fork.
- [ ] Keep existing `public/home.html`, `public/site.css`, etc. in place (they're linked from `/r/:loc/home.html` static fallback and `skbbellevue.com/`). The legacy files become the saffron template's canonical copy; server-side renderer resolves by `websiteTemplate`.

### Server-side template router

- [ ] `src/mcp-server.ts` — replace the static `SITE_PAGE_MAP` handler with a resolver that (a) reads `location.websiteTemplate` (default `'saffron'`), (b) serves `public/templates/<template>/<file>` when it exists, else (c) falls back to legacy `public/<file>` for backward compat (so SKB keeps working even if a slug has no template files).
- [ ] `src/services/site-renderer.ts` — new module exporting `renderSitePage(locationId, pageKey) -> Promise<string>`. Reads location from DB, loads the right template HTML from disk, and performs simple `{{placeholder}}` substitution on a small, documented set of placeholders. Missing placeholders fall back to literal built-in defaults baked into the template HTML (so a template opened directly still renders).
- [ ] Structured content injection: placeholders wired to `location.content` where set. Escape HTML-unsafe values (reuse `esc()` semantics from `site-config.js`).
- [ ] `public/assets/{slug}/` directory is already referenced by the spec; no new upload code in #56 (§7 calls it out, but issue #56 Acceptance criteria do not require upload endpoints). Flag as deferral at the bottom of this doc.

### Admin Website tab

- [ ] `public/admin.html` — add a tabs row at the top of `<main class="admin-main">` to switch between "Workspace" (existing) and "Website" (new). Keep current layout untouched when "Workspace" tab is active.
- [ ] `public/admin.html` — new "Website" panel containing: template picker (2 cards with swatch, "Current" badge, Preview button opening `/r/:loc/` in new tab), content editor (hero headline, hero subhead, about, instagram handle, reservations note, contact email), Save button + "Saved Xm ago" flag.
- [ ] `public/admin.js` — new section that loads `api/host/website-config` on admin enter, renders the picker + editor, wires Save to POST `api/host/website-config`, and tracks "Saved X ago" using a timestamp.
- [ ] `public/styles.css` — add the minimum needed styles for tabs + template-card (use existing tokens; reuse `.admin-card`, `.primary`, `.visit-field` wherever possible; one new block for the 2-card swatch grid).

### Tests

- [ ] `tests/unit/locationConfigValidation.test.ts` — extend with cases for `validateWebsiteConfigUpdate`.
- [ ] `tests/unit/siteRenderer.test.ts` — new test file. Covers: placeholder substitution, default fallback when content field is absent, HTML-escaping of user-supplied strings, template key resolution, backward compat (legacy `public/home.html` served when no `templates/<key>/` exists).
- [ ] `tests/integration/site-renderer.integration.test.ts` — new. Covers: `/r/:loc/` serves saffron when `websiteTemplate` unset; changes to `'slate'` make the next request serve slate HTML; `POST /r/:loc/api/host/website-config` round-trips; `/public-config` exposes template + content.
- [ ] Add to `package.json` test scripts so the new suites actually run.

### Validation + docs

- [ ] Manual validation (browser): open `/r/skb/` locally → saffron renders byte-identical to today (R1). Create a second location, set `websiteTemplate='slate'`, visit its `/r/<slug>/` and confirm slate renders (R2). Switch `skb` to slate and back, confirm no data loss (R3, R5). Capture screenshots to `docs/evidence/56-feature-implementation-evidence.md`.
- [ ] Architecture note: update `docs/architecture/` (if present) with the template-resolver pattern.
- [ ] Retrospective after submission.

---

## Validation Requirements

- `uiValidationRequired: true` — adds new admin tab and introduces a new public template (slate). Must be visually verified in a browser across desktop and phone viewports.
- `mobileValidationRequired: false` — no platform-specific (iOS/Android emulator) behavior introduced. Responsive checks at 375/768/1440 widths are sufficient and fall under browser validation.
- Evidence artifact: `docs/evidence/56-ui-polish-validation.md` (created during phase 5+).
- Target browsers: latest Chromium and Firefox; Safari best-effort.
- Cross-tenant probe (spec §11.3): adding a `POST /host/website-config` endpoint must not allow a session holding `loc=A`'s cookie to mutate `loc=B`. The existing `requireHost` middleware today verifies only cookie signature, not locationId match. §11.3 is owned by sub-issue 51a (auth refactor); for #56 we add an integration test that documents expected future behavior and relies on the existing cookie isolation (per-location PIN) as the interim guarantee.

## Known deferrals / Open questions

- **Asset upload endpoint** (spec §7 item 8): issue #56 acceptance criteria don't require it (R1–R6 don't mention it); defer to a follow-up. The content editor accepts image URLs only in v1; owner uploads files via MCP/Mongo or a future endpoint.
- **`knownFor` editor UI**: the mock shows only hero/about/instagram/reservations inline. `knownFor` array (3 cards) is in the data model but v1 admin UI shows it as read-only with a "Edit coming soon" note; full CRUD UI lands in a follow-up. This matches the spec §7 content-editor list but is a conscious scope cut to keep #56 shippable.
- **Named-role gating** for `/config/website` (spec §8.5 says owner+admin): blocked on 51b; v1 reuses `requireHost` (single shared PIN per location). Code comment + PR description both call this out.
- **Scope size estimate**: ~12 new/changed files, well under the 15-file checkpoint — no phase split needed.

## Pattern Discovery snapshot

- **Environment config**: none new. Existing `SKB_COOKIE_SECRET`, `SKB_HOST_PIN` suffice. No new secrets introduced.
- **Constants**: reuse color tokens from mock `51-public-template-gallery.html` for slate palette; reuse `styles.css` admin tokens for the Website tab.
- **Utility functions**: reuse `toPublicLocation` (extend), `validateSiteConfigUpdate` pattern (add parallel `validateWebsiteConfigUpdate`), `site-config.js` DOM injection (unchanged — placeholders on the HTML match existing IDs).
- **Architectural patterns**: "pure validator + DB wrapper" split (see `validateSiteConfigUpdate` + `updateLocationSiteConfig`). Route handler pattern: `GET` + `POST` pair under `/host/<concern>-config`. Static file route pattern: `SITE_PAGE_MAP` in `mcp-server.ts`.

---

_Issue type: **feature** (net-new capability; builds on existing #45 static site pattern)._
