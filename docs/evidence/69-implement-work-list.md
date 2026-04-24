# Implementation Work List — Issue #69

**Status:** in progress
**Branch:** `spec/69-shared-sms-number-multitenant`
**Spec:** `docs/feature-specs/69-shared-sms-number-multitenant.md`
**RFC:** `docs/rfcs/69-multi-tenant-sms-voice.md`
**Framing:** B (OSH-as-direct-customer / Yelp pattern)

## Scope for this session (walking skeleton)

Code changes are backward-compatible with the existing SKB long-code deployment. The new tenant-agnostic `/api/sms/inbound` route ships alongside the existing `/r/:loc/api/sms/inbound`; the legacy route remains wired until the Twilio number is actually cut over to the shared toll-free post-TFV approval. All changes can land to prod without changing observable behavior on SKB today.

### In scope

- [ ] `src/types/queue.ts` — add `smsSenderName?`, `twilioVoiceNumber?`, `twilioVoiceNumberSid?` to `Location`.
- [ ] `src/core/db/mongo.ts` — add `smsOptOuts(db)` collection helper + index on `phone` (unique).
- [ ] `src/types/sms.ts` (new) — `SmsOptOut` interface.
- [ ] `src/services/sms.ts` — `sendSms(to, body, opts?: {locationId?})`; opt-out suppression before dispatch; prefix body with location's `smsSenderName` (fallback to `name`, then `"OSH"`) if not already prefixed.
- [ ] `src/services/smsTemplates.ts` — remove hardcoded `"SKB:"` prefix from all templates; return plain body text. Update callers implicitly (prefix now applied by `sendSms`).
- [ ] `src/services/chat.ts` — add `resolveInboundTenant(fromPhone, serviceDay)` returning `{kind: 'match'|'none'|'collision', ...}`. Keep existing `appendInbound` unchanged.
- [ ] `src/routes/sms.ts` — add `smsGlobalInboundRouter()` mounted at `POST /api/sms/inbound`. Handles STOP/START/HELP at platform level, then `resolveInboundTenant` → single-match dispatch to `appendInbound`, collision/no-match logged (R6 disambiguation deferred).
- [ ] `src/mcp-server.ts` — mount the new global SMS inbound router alongside `smsStatusRouter()`.
- [ ] Thread `locationId` through outbound callers (all 4 sites have it in scope):
  - [ ] `src/routes/queue.ts:114`
  - [ ] `src/routes/voice.ts:447`
  - [ ] `src/services/chat.ts:52`
  - [ ] `src/services/queue.ts:439`

### Tests in scope

- [ ] `tests/unit/smsTemplates.test.ts` — update existing tests to reflect removal of "SKB:" prefix.
- [ ] `tests/unit/sms.test.ts` — add cases for opt-out suppression + display-name prefix application.
- [ ] `tests/unit/smsOptOuts.test.ts` (new) — normalize phone, upsert/remove.
- [ ] `tests/unit/smsInboundKeywords.test.ts` (new) — STOP/START/HELP regex matching.
- [ ] `tests/unit/resolveInboundTenant.test.ts` (new) — match/none/collision across 1..N tenants. Uses existing Mongo test pattern.

### Validation Requirements

- `uiValidationRequired`: **no** (no UI changes in this scope).
- `mobileValidationRequired`: **no**.
- `build`: `npm run build` must pass.
- `typecheck`: clean.
- `unit tests`: `npm test` green.
- `manual smoke`: can't smoke shared toll-free before TFV; manual sanity on unit-test level only this session.

### Deferred (tracked here, out of scope for this session)

> **Tripwire — BLOCKS `/ui-polish` and `/bug-bash`.** The two items tagged
> `ui-surface` below are user-facing UI surfaces. Until they are implemented
> as a running, Playwright-drivable admin page and join form, the
> `ui-polish-validation` and `user-testing-and-bug-bash` phases have **no
> valid target**. If a future session invokes either phase while these
> surfaces are still deferred, surface this tripwire and ask the user
> whether to (a) wire the UI first, then run polish/bash against the real
> thing, or (b) scope polish/bash out of the current PR. Do not fabricate
> a substitute target (e.g., a static design mock).

- `ui-surface` Admin UI: Sender-name field in admin Settings → Messaging (mock exists; wiring + form deferred).
- `ui-surface` Join-form consent-copy update to explicitly name OSH as sender.
- Disambiguation flow (R6) — only activates with a shared number in prod.
- Integration tests for `/api/sms/inbound` against an ephemeral Mongo.
- E2E test via Twilio magic test credentials.
- Voice number provisioning flow for a second tenant.
- Twilio TFV submission (Sid-operator task, not code).
- Spec errata to align §1, §4, §7, §9, §12 wording with Framing B framing (RFC is authoritative; spec text update can follow in a separate docs-only commit).

### Known deferrals / open questions

- Whether to gate the new `/api/sms/inbound` behind a feature flag until TFV is approved. Decision: **no flag** — it's a new route, harmless if Twilio isn't configured to hit it yet; having it in place reduces cutover risk.
- Whether to retroactively fill `smsSenderName = "Shri Krishna Bhavan"` for the `skb` location. Decision: **yes**, via a one-line migration note (manual Mongo update, documented in the evidence doc; no script — one document).

## Discovered patterns (pattern-discovery skill output)

- **Env vars:** direct `process.env.X` reads with null guards. Gated configs use `getConfig()` pattern returning `null` on missing required env — see `src/services/sms.ts:19-25`.
- **DB accessors:** `getDb()` singleton in `src/core/db/mongo.ts`; collection helpers `locations(db)`, `queueEntries(db)`, etc. Indexes bootstrapped on first `getDb()` call.
- **Services layer:** Wraps external SDKs, returns typed results with `{successful: bool, status, ...}` shape — see `SmsSendResult` in `src/services/sms.ts:7-11`.
- **Routers:** Tenant-scoped via `Router({mergeParams: true})` mounted at `/r/:loc/api`; tenant-global at `/api`. Pattern-match split: `smsRouter()` (tenant-scoped) vs `smsStatusRouter()` (tenant-global) — direct precedent for the new `smsGlobalInboundRouter()`.
- **Structured logging:** `console.log(JSON.stringify({t, level, msg, ...fields}))` where `msg` is a dotted event name used in KQL saved searches. All new log lines must follow this shape.
- **Twilio signature validation:** `validateTwilioSignature` middleware applied per route.
- **Phone normalization:** `phone.replace(/\D/g, '').replace(/^1/, '').slice(-10)` — lifted verbatim from `src/services/chat.ts:151`.
- **Test runner:** Node built-in `test` via `tests/test-utils.ts::runTests(cases, title)`. Each test is `{name, tags[], testFn: async () => boolean}`. Run list is the literal `npm test` command in package.json — new test files must be appended there.

## Checklist meta

- File modifications target: ~10 (comfortably under the 15-file Phase-Splitting threshold).
- Feature, not bug.
