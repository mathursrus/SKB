# Issue #56 — Quality Review Feedback

## Summary
Code quality review against `rules/engineering/architecture-standards.md` and the Standing Work List's pattern-discovery snapshot.

## Findings

### NONE — all checks pass

### Notable observations (not gating)

1. **`src/services/locations.ts` is now 528 lines** — 28 over the 500-line guideline.
   - **Justification**: The file is the canonical Location service. It already houses four parallel `update*Config` functions (visit, voice, site) following the same validator+updater pattern; adding `updateLocationWebsiteConfig` keeps that pattern consolidated. Splitting would create a second import surface for the same Location collection and obscure the pattern.
   - **Status**: ADDRESSED via justification. Revisit if a fifth config area is added.

2. **Color duplication across CSS files** (`#1f6a5d` teal).
   - Present in `public/templates/slate/site.css` (canonical slate palette), `public/styles.css` (Website tab picker swatch), and the mock (reference). The admin.html color is a one-time swatch for the "Slate" gradient in the picker; the slate template's color is the rendered palette. Each file needs its own copy because there is no shared design-token file today (deferred by the spec to the rebrand sub-issue, #55 or beyond).
   - **Status**: ADDRESSED. Tokenization deferred to platform-rebrand sub-issue.

3. **Tenant isolation gap** (pre-existing).
   - `requireHost` verifies cookie HMAC but not `locationId` match. `/host/website-config` inherits this gap. Documented in Standing Work List and `56-feature-implementation-evidence.md`; fix is owned by sub-issue 51a (auth refactor).
   - **Status**: Documented deferral; not a #56 quality failure.

4. **Security: HTML escaping is load-bearing**.
   - `renderTemplate` escapes all placeholder values before substitution. Tests (`unit/siteRenderer.test.ts` "HTML-unsafe characters in content are escaped"; integration "security: content is HTML-escaped") assert the defense. Admin-side length caps (validator) provide defense in depth.
   - **Status**: ADDRESSED, tested.

## Architecture standards compliance

| Standard | Result |
|---|---|
| AI vs Deterministic Separation | ✅ No AI/LLM code touched. |
| Clean Architecture Layers | ✅ Renderer is pure; DB access stays in `services/locations.ts`; route handler in `routes/host.ts`; template HTML in `public/templates/`. |
| Testability (DI, pure fns) | ✅ `renderTemplate` and `validateWebsiteConfigUpdate` are pure and unit-tested. |
| No hardcoded credentials | ✅ No secrets introduced. |
| DRY | ✅ Website-tab config follows the same validator+updater pattern as site-config. |
| Code organization | ✅ Files under 500 lines except `locations.ts` (justified above). |
| Environment variables | ✅ No new env vars introduced. |

## UI baseline (generic)

- Admin Website tab mock (`docs/feature-specs/mocks/51-admin-brand-staff.html`) — reviewed visually; real UI replicates card layout, palette swatch, Current badge, Preview link, Save button, Saved-X-ago flag.
- Public slate preview mock (`docs/feature-specs/mocks/51-public-template-gallery.html`) — reviewed visually; real slate template CSS matches palette (`#1f6a5d` teal, `#f4f6f4` off-white, Archivo SemiCondensed + IBM Plex Sans), responsive at 375/720px via media queries.
- Deep UI-polish validation lives in the parent Phase 11 (`ui-polish-validation` job) per the parent task list.

## Result

**PASS** — no unaddressed quality issues.
