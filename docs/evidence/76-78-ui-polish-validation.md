## Issues 76 and 78 validation

Date: 2026-04-24

Scope verified:
- Extended hours model accepts `breakfast`, `lunch`, `special`, and `dinner`.
- IVR hours speech groups distinct weekday/weekend schedules instead of reading only the first open day.
- Google Business hours export includes all configured service windows.
- Admin and onboarding markup now expose the extra service windows plus copy-across-days controls.

Automated checks run:
- `npx tsx --test tests/unit/locationConfigValidation.test.ts`
- `npx tsx --test tests/unit/locationTemplate.test.ts`
- `npx tsx --test tests/unit/googleBusiness.test.ts`
- `npx tsx --test tests/unit/adminTabs.test.ts tests/unit/onboardingWizard.test.ts`
- `npm run typecheck`
- `npx tsx --test tests/integration/voice.integration.test.ts`
- `node --check public/admin.js`
- `node --check public/onboarding.js`
- `node --check public/site-config.js`

Notes:
- No full browser-click manual pass was run in this turn.
- Static admin/onboarding contract tests and JS syntax checks passed.
