# Adhoc owner staff email fix - Standing Work List

## Scope summary

Owner-created staff invites currently attempt email delivery, but the repo still has three gaps:

1. The backend returns success without telling the caller whether email was actually delivered or only logged.
2. Owner-facing clients say the invitee "will receive" an email even when ACS is unconfigured and delivery fell back to log-only mode.
3. Repo wiring is incomplete for real ACS delivery because the email SDK is not a declared dependency and the ACS env vars are not documented in the sample env/docs.

Issue type: **bug**

## Implementation checklist

- [ ] `tests/integration/invites.integration.test.ts` - assert the invite route returns delivery metadata in the API response.
- [ ] `src/routes/host.ts` - await `sendEmail(...)` for `/staff/invite` and return `{ invite, delivery }` instead of claiming success unconditionally.
- [ ] `ios/src/net/endpoints.ts` - type the new invite response shape with delivery metadata.
- [ ] `ios/src/features/admin/StaffSection.tsx` - show delivery-aware owner messaging instead of always saying the recipient will receive an invite link.
- [ ] `public/admin.js` - show delivery-aware owner messaging in the web admin staff tab.
- [ ] `public/onboarding.js` - preserve successful invite creation while surfacing any delivery warnings during onboarding staff invites.
- [ ] `package.json` / `package-lock.json` - declare `@azure/communication-email` so configured environments can actually send mail.
- [ ] `.env.example` and `README.md` - document `ACS_EMAIL_CONNECTION_STRING`, `ACS_EMAIL_SENDER`, and `PLATFORM_PUBLIC_URL`.

## Validation requirements

- `uiValidationRequired`: true
- `mobileValidationRequired`: false
- Browser validation: owner invite flow in web admin and onboarding should distinguish delivered email from log-only fallback.
- App validation: React Native staff invite alert should distinguish delivered email from log-only fallback.

## Patterns leveraged

- Existing `sendEmail(...)` result contract in `src/services/mailer.ts`
- Existing owner invite flow in `src/routes/host.ts`
- Existing client-side status/alert messaging patterns in `public/admin.js` and `ios/src/features/admin/StaffSection.tsx`

## Open questions

None. The current repo behavior is concrete and the fix is scoped to accuracy plus missing wiring.

## Validation evidence

- `npm run typecheck` - pass
- `npm test` - pass
- `npx tsx --test tests/integration/invites.integration.test.ts` - pass
- `npx tsx --test tests/integration/staff-invite-production.integration.test.ts` - pass
- `npx tsc -p ios/tsconfig.json --noEmit` - pass
- `npx tsx --test tests/ui/staff-invite-delivery.ui.test.ts` - pass
- Manual API probe against a local server with ACS env vars unset - `POST /r/manual-mail-check/api/staff/invite` returned `delivery.mode: "log-only"` plus `deliveryMessage: "Invite created for invitee-manual@example.test, but email delivery is not configured in this environment."`
- Manual production-mode probe with ACS env vars unset - `POST /r/manual-mail-production/api/staff/invite` now fails closed with HTTP 503 instead of creating a dead invite
- `npm run test:all` - not clean due pre-existing unrelated regression outside this change:
  - isolated rerun: `npx tsx --test tests/integration/host-auth.integration.test.ts` fails at `host sentiment: seated party appears in dining and still supports set/clear override`
