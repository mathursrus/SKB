# Caller Journey Follow-up Implement Work List

Issue: `caller-journey-followup`
Base design: [83-caller-statistics.md](../rfcs/83-caller-statistics.md)
Base spec: [83-caller-statistics.md](../feature-specs/83-caller-statistics.md)

## Scope

This follow-up extends the existing caller statistics UI so an admin can click a recent caller row and inspect that caller's IVR journey in the existing detail card. It remains inside the issue `#83` architecture:

- no new routes
- no new collections
- no new environment variables
- no expansion of stored PII

Issue type: `feature`

## Pattern Discovery

- Routes delegate aggregation to services: `src/routes/host.ts` -> `src/services/callerStats.ts`
- Privacy-minimized analytics DTOs live in `src/types/queue.ts`
- Admin dashboard UI is plain HTML + `public/admin.js` + `public/styles.css`
- Integration tests use `tests/test-utils.ts` and `tests/shared-server-utils.ts`
- Config/env access stays unchanged for this follow-up; no new `process.env` reads are needed

## Standing Checklist

- [x] `src/types/queue.ts` - Extend recent caller DTOs with a privacy-safe `journey` array
- [x] `src/services/callerStats.ts` - Map stored session steps into the new recent-session journey payload
- [x] `public/admin.html` - Keep the existing caller detail card but allow journey content to replace the aggregate copy block
- [x] `public/admin.js` - Make recent caller rows selectable and render a clean journey timeline for the selected row
- [x] `public/styles.css` - Add selected-row and journey timeline styles that work at mobile width
- [x] `tests/integration/caller-stats.integration.test.ts` - Assert the endpoint returns privacy-minimized journey steps without leaking full phone data

## Quality Requirements

- Follow the existing Admin card/table visual language
- Keep the journey readable on phone width without horizontal dead ends
- Reuse existing data already persisted in `voice_call_sessions.steps`
- Preserve aggregate outcome-detail behavior when no row is selected
- Keep the payload privacy-minimized: no full phone number, no caller name, no transcript content

## Validation Requirements

- `uiValidationRequired: true`
- `browserValidationRequired: true`
- `mobileValidationRequired: false`
- Target journeys:
  - default aggregate outcome detail still renders
  - clicking a recent caller row shows that caller's ordered journey
  - keyboard activation (`Enter` / `Space`) selects a row
  - selected-row state remains visible
- Breakpoints:
  - desktop/laptop width
  - phone-width responsive browser viewport
- Automated validation:
  - `npm run build`
  - `npx tsx --test --test-concurrency=1 tests/integration/caller-stats.integration.test.ts`
- Manual validation artifact:
  - `docs/evidence/caller-journey-followup-ui-polish-validation.md`

## Open Questions / Deferrals

- No separate deep-linking or persisted selection state is included in this follow-up
- No separate caller-detail API is added; the recent-session payload remains embedded in the existing caller-stats response
