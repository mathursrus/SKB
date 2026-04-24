# Implementation Evidence — Issue #69

**Issue:** [Multi-tenant SMS/voice routing with a single shared OSH toll-free number](https://github.com/mathursrus/SKB/issues/69)
**PR:** #70 (adds to the existing spec/RFC PR)
**Branch:** `spec/69-shared-sms-number-multitenant`

## Summary

Walking-skeleton implementation of the shared-number SMS multi-tenancy for OSH under Framing B (RFC recommendation). Backward-compatible with the current SKB long-code deployment — all new code paths are additive. The cutover happens at operator level (Twilio TFV submission + config flip) after this lands.

## Work completed

### Data model

- `src/types/queue.ts`: added `smsSenderName`, `twilioVoiceNumber`, `twilioVoiceNumberSid` to `Location`.
- `src/types/sms.ts` (new): `SmsOptOut` interface.
- `src/core/db/mongo.ts`: added `smsOptOuts(db)` collection helper + unique index on `phone`.

### Pure helpers

- `src/utils/smsKeywords.ts` (new): `isStopKeyword`, `isStartKeyword`, `isHelpKeyword` — first-token matchers with CTIA-aligned aliases.
- `src/utils/smsPhone.ts` (new): `normalizePhone` — lifted from the existing inline normalization so both code paths match behavior.
- `src/utils/smsSenderPrefix.ts` (new): `applySenderPrefix(body, senderName)` — idempotent prefix helper with `"OSH"` fallback.

### Services

- `src/services/smsOptOuts.ts` (new): `isOptedOut`, `recordOptOut`, `clearOptOut` — platform-wide opt-out ledger.
- `src/services/sms.ts`: `sendSms` now accepts `{locationId?}` option; config check runs first (no DB fan-out for not-configured callers); opt-out short-circuit; per-tenant display-name prefix resolution and application.
- `src/services/smsTemplates.ts`: removed the hardcoded `"SKB:"` prefix from every template. Prefix is now applied centrally by `sendSms`.
- `src/services/chat.ts`: added `resolveInboundTenant(fromPhone, serviceDay)` → `match` / `none` / `collision`. Threaded `locationId` into the existing `sendSms` call.

### Routes

- `src/routes/sms.ts`: added `smsGlobalInboundRouter()` exposing `POST /sms/inbound` for the shared toll-free number. Handles STOP/START/HELP at the platform level before tenant resolution; routes single-match inbound to `appendInbound(resolvedLocationId, ...)`; logs collisions and cold inbounds without replying. Collision disambiguation (R6) remains deferred — only activates once we have real multi-tenant traffic.
- `src/mcp-server.ts`: mounted the new router at `/api`. Existing tenant-scoped `/r/:loc/api/sms/inbound` stays wired as the legacy path for the SKB long code.

### Callers threaded with `locationId`

- `src/routes/queue.ts:114` — join-confirmation SMS.
- `src/routes/voice.ts:447` — voice-join-confirmation SMS.
- `src/services/chat.ts:52` — host-initiated chat messages.
- `src/services/queue.ts:439` — host call-party notifications.

### Tests

- `tests/unit/smsTemplates.test.ts` (updated): reflects removal of hardcoded `"SKB:"` prefix; asserts no template embeds a platform prefix.
- `tests/unit/smsKeywords.test.ts` (new): 23 cases covering STOP/START/HELP recognition, case-insensitivity, first-token semantics, and common false-positive phrases.
- `tests/unit/smsSenderPrefix.test.ts` (new): 7 cases covering idempotence, `OSH` fallback (undefined / empty / whitespace), trimming, and collision-body handling.
- `tests/unit/smsPhone.test.ts` (new): 7 cases covering 10-digit / E.164 / leading-1 / formatted / junk / empty inputs.
- `tests/unit/sms.test.ts` (updated): added a final `closeDb` cleanup case so the suite terminates cleanly after the DB-touching opt-out check.
- `package.json`: appended the three new test files to the `test` script.

## Validation

| Step | Command | Result |
|---|---|---|
| TypeScript typecheck | `npm run typecheck` | clean |
| New keyword tests | `npx tsx tests/unit/smsKeywords.test.ts` | 23/23 pass |
| New prefix tests | `npx tsx tests/unit/smsSenderPrefix.test.ts` | 7/7 pass |
| New phone-normalization tests | `npx tsx tests/unit/smsPhone.test.ts` | 7/7 pass |
| Updated templates tests | `npx tsx tests/unit/smsTemplates.test.ts` | 7/7 pass |
| Existing SMS service tests | `npx tsx tests/unit/sms.test.ts` | 8/8 pass, exits 0 |
| Adjacent SMS tests | `npx tsx tests/unit/smsStatusRoute.test.ts` + `twilioValidation.test.ts` + `voiceTemplates.test.ts` | all green |
| Full unit suite | `npm test` | 38 of 39 files green; 1 pre-existing failure on `googleBusiness.test.ts::credential-missing` (confirmed pre-existing on master via stash-and-retest) |

Failing test unrelated to this work, confirmed by reverting all diff-set files via `git stash push` and re-running `googleBusiness.test.ts`: same failure. Unstashed after the check. Tracked as a separate concern.

## Quality checks

- [x] Every exported symbol has a module header comment explaining its role.
- [x] No `TODO` / `FIXME` / placeholder comments committed.
- [x] Structured JSON log events added for new code paths (`sms.suppressed_opt_out`, `sms.inbound.stop_received`, `sms.inbound.start_received`, `sms.inbound.help_responded`, `sms.inbound.collision`, `sms.inbound.unmatched`).
- [x] New code paths preserve existing semantics on the legacy SKB long code — the `/r/:loc/api/sms/inbound` route and `smsRouter()` are untouched.
- [x] `sendSms` is backward-compatible: existing callers can omit `opts` and get `OSH` as a generic fallback prefix (behavior is preserved for the SKB tenant by passing its `locationId`, which it now does at every call site).

## Deferred (captured in work list, not in this diff)

- Admin UI wiring for the sender-name field on Settings → Messaging (mock exists).
- Consent-copy update on `/r/:loc/join` to explicitly name OSH as the sender.
- Disambiguation flow (R6) — meaningful only once shared-number traffic is live post-TFV.
- Integration tests for `POST /api/sms/inbound` against ephemeral Mongo.
- Voice-number provisioning flow for a second tenant (opt-in).
- Twilio TFV submission (operator task, outside this code).
- Spec (#70) narrative alignment to Framing B wording — RFC already authoritative.

## Operator notes (post-merge)

1. Add `smsSenderName = "Shri Krishna Bhavan"` on the existing `skb` location record (one-document Mongo update). Without this, the new prefix code falls back to `location.name` (`"Shri Krishna Bhavan"`), so the SMS diners see will already be correct — the explicit field exists for future edits via the admin UI.
2. File the OSH Toll-Free Verification with Twilio (Framing B direct-customer). Do not cut `TWILIO_PHONE_NUMBER` to the new toll-free until `TWILIO_APPROVED`.
3. Once approved, point the shared toll-free's SMS webhook at `POST /api/sms/inbound` and flip `TWILIO_PHONE_NUMBER`. The legacy SKB long code webhook at `/r/skb/api/sms/inbound` can stay during a 30-day failover window then be released.
