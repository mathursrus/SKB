# Issue 46 — Implement Work List

## Scope Summary

Implement the Host/Admin workspace split approved in the feature spec and RFC.

- Keep live ETA controls in Host.
- Move stats, retrospective analytics, visit-page configuration, and IVR/system configuration into a new Admin workspace.
- Extend analytics to support lifecycle start/end stage filtering.
- Add host-authenticated voice-config read/write endpoints.

Issue type: `feature`

## Discovered Patterns

- Frontend is plain static HTML + browser JS under `public/` with one IIFE per page.
- Auth uses a shared host cookie (`skb_host`) minted by `POST /api/host/login` and cleared by `POST /api/host/logout`.
- Host page currently mixes live queue operations with stats and visit-page admin sections.
- Existing settings pattern:
  - ETA / turn-time lives under `GET/POST /api/host/settings`
  - Visit-page routing lives under `GET/POST /api/host/visit-config`
- Analytics already uses a service-layer histogram builder in `src/services/analytics.ts` and a client renderer in `public/analytics.js`.
- Location-level guest-entry config belongs on the `Location` document in `src/types/queue.ts` and `src/services/locations.ts`.
- Tests are lightweight TypeScript scripts under `tests/unit/` and `tests/integration/`, executed directly via `tsx`.

## Validation Requirements

- `uiValidationRequired: true`
- `mobileValidationRequired: true`
- `apiValidationRequired: true`
- `typecheckRequired: true`
- `integrationTestRequired: true`
- `browserBaseline: Chromium in integrated browser`
- `targetBreakpoints: 375px mobile portrait, tablet/desktop host/admin layouts`
- `evidenceArtifact: docs/evidence/46-ui-polish-validation.md`

## Implementation Checklist

- [ ] `src/types/queue.ts` - Add analytics stage typings and proposed location voice-config fields used by the new admin API.
- [ ] `src/services/analytics.ts` - Extend `getAnalytics()` for optional `startStage` / `endStage` filtering with forward-pair validation.
- [ ] `src/services/locations.ts` - Add read/write helpers for voice-related location config.
- [ ] `src/routes/host.ts` - Extend `/host/analytics` query handling and add `GET/POST /host/voice-config`.
- [ ] `src/mcp-server.ts` - Surface `admin.html` as a first-class location page and update landing-page links from `Analytics` to `Admin`.
- [ ] `public/admin.html` - Create Admin workspace shell with login view, stats area, stage-based analytics controls, visit config, IVR/system config, and `Back to Host` action.
- [ ] `public/admin.js` - Implement Admin page auth flow, data loading, stage/range/party-size controls, visit-config save, and voice-config save.
- [ ] `public/host.html` - Remove embedded stats and visit-page admin sections; replace analytics link with `Open Admin`; preserve ETA controls.
- [ ] `public/host.js` - Remove host-side stats/visit-config loading, add workspace persistence/navigation, keep live ETA settings behavior intact.
- [ ] `public/styles.css` - Add admin workspace styles and preserve host/mobile layout quality after section removal.
- [ ] `tests/unit/` - Add analytics stage-pair validation coverage and voice-config validation coverage.
- [ ] `tests/integration/` - Add/extend tests for `GET /host/analytics` with stage pairs and `GET/POST /host/voice-config`.
- [ ] `docs/evidence/46-ui-polish-validation.md` - Record browser/mobile manual validation evidence for Host and Admin journeys.

## Quality Requirements

- Follow existing route/service layering; keep Express handlers thin.
- Reuse the current host auth cookie flow rather than inventing a second auth model.
- Preserve existing host queue, dining, chat, call, and ETA behavior.
- Keep Admin retrospective/config-oriented; do not reintroduce live queue actions there.
- Preserve analytics backward compatibility when `startStage` / `endStage` are omitted.
- No TODOs or placeholder UI copy.

## Test Strategy Slice

- Unit:
  - analytics lifecycle stage validation and histogram selection
  - voice-config input validation / normalization
- Integration:
  - auth-protected Admin API endpoints
  - stage-based analytics endpoint behavior
  - voice-config persistence behavior
- Manual UI:
  - Host page still supports core queue operations and ETA controls
  - Admin page loads correctly, switches via shared auth, and supports analytics + guest-entry settings
  - Mobile portrait validation for Host and responsive/mobile sanity check for Admin

## Known Deferrals / Guardrails

- No RBAC split in this issue; Host and Admin share the same auth cookie.
- No IVR flow redesign; only expose admin-facing configuration over the existing voice behavior.
- No new architecture document exists in repo; implementation should follow current codebase patterns plus the approved RFC.