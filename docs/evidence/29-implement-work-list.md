# Implementation Work List — Issue #29: SMS Users When Host Calls Them

## Issue Type: Feature

## Implementation Checklist

### Backend — Types
- [ ] `src/types/queue.ts` — Add `CallRecord` interface (`at: Date`, `smsStatus`, `smsMessageId?`)
- [ ] `src/types/queue.ts` — Change `QueueEntry.phoneLast4?: string` → `phone: string`
- [ ] `src/types/queue.ts` — Change `QueueEntry.calls?: Date[]` → `calls?: CallRecord[]`
- [ ] `src/types/queue.ts` — Change `JoinRequestDTO.phoneLast4?: string` → `phone: string`
- [ ] `src/types/queue.ts` — Change `HostPartyDTO.phoneLast4: string | null` → `phoneMasked: string`
- [ ] `src/types/queue.ts` — Change `HostPartyDTO.callsMinutesAgo: number[]` → `calls: { minutesAgo: number; smsStatus: string }[]`

### Backend — New SMS Service
- [ ] `src/services/sms.ts` — Create: `sendSms(to, body)` → `SmsSendResult`, `getConfig()`, `maskPhone()`
- [ ] `src/services/smsTemplates.ts` — Create: `joinConfirmationMessage()`, `firstCallMessage()`, `repeatCallMessage()`

### Backend — Service Changes
- [ ] `src/services/queue.ts` — `joinQueue()`: change `phoneLast4` → `phone` in entry creation
- [ ] `src/services/queue.ts` — `callParty()`: read entry first, send SMS, push `CallRecord`, return `smsStatus`
- [ ] `src/services/queue.ts` — `listHostQueue()`: map `phoneMasked` instead of `phoneLast4`, map `calls` to `{minutesAgo, smsStatus}`
- [ ] `src/services/queue.ts` — `getStatusByCode()`: keep unchanged (no phone in public response)

### Backend — Route Changes
- [ ] `src/routes/queue.ts` — `validateJoin()`: require `phone` (10 digits), remove `phoneLast4` validation
- [ ] `src/routes/queue.ts` — Join route: pass `phone` to `joinQueue()`, fire-and-forget confirmation SMS
- [ ] `src/routes/host.ts` — Call route: return `smsStatus` from `callParty()` in response

### Frontend — Diner
- [ ] `public/queue.html` — Replace phone field (required, 10 digits, helper text)
- [ ] `public/queue.js` — Send `phone` instead of `phoneLast4`, client-side validation

### Frontend — Host
- [ ] `public/host.js` — Display `phoneMasked`, show checkmark/X after call based on `smsStatus`

### Config
- [ ] `.env.example` — Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

### Tests
- [ ] `tests/unit/sms.test.ts` (NEW) — sendSms success/failure/not-configured, maskPhone
- [ ] `tests/unit/smsTemplates.test.ts` (NEW) — All 3 message templates
- [ ] `tests/integration/queue.integration.test.ts` (MODIFY) — Join with phone, call with smsStatus, host queue phoneMasked

**Total files modified**: ~13 (under 15 threshold — no phase splitting needed)

## Validation Requirements

- `uiValidationRequired`: true (diner join form + host dashboard)
- `mobileValidationRequired`: false (existing responsive design, no new mobile-specific flows)
- `browserValidation`: Verify updated join form and host SMS indicator at desktop viewport
- `apiValidation`: All 10 validation scenarios from RFC

## Known Deferrals
- Real Twilio phone number provisioning (requires account upgrade)
- ACS migration (#33)
- 10DLC registration (parallel track)
