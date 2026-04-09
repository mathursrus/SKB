# Implementation Work List — Issue #31: Phone System Integration

## Issue Type: Feature

## Source Documents
- Spec: `docs/feature-specs/31-phone-system-integration-of-wait-list.md`
- RFC: `docs/rfcs/31-phone-system-integration-of-wait-list.md`
- Spike: `src/routes/voice-spike.ts` (proven patterns)

## Implementation Checklist

### New Files
- [ ] `src/routes/voice.ts` — Production voice router (replace spike), 8 endpoints
- [ ] `src/services/voiceTemplates.ts` — `spellOutCode()`, `spellOutPhone()`, `formatEtaForSpeech()`, `normalizeCallerPhone()`, `escXml()`
- [ ] `src/middleware/twilioValidation.ts` — Webhook signature validation middleware
- [ ] `tests/unit/voiceTemplates.test.ts` — Unit tests for all pure voice template functions
- [ ] `tests/unit/twilioValidation.test.ts` — Unit tests for signature validation
- [ ] `tests/integration/voice.integration.test.ts` — Full IVR flow integration tests

### Modified Files
- [ ] `src/mcp-server.ts` — Conditional voice route registration (TWILIO_VOICE_ENABLED)
- [ ] `src/types/queue.ts` — Add optional `frontDeskPhone` to Location interface
- [ ] `.env.example` — Add TWILIO_VOICE_ENABLED variable

### Files to Remove After Implementation
- [ ] `src/routes/voice-spike.ts` — Replace with production `voice.ts`

## Spike Findings to Apply
1. No `voice="Polly.Joanna"` in post-speech TwiML — use default voice
2. No `speechModel`/`enhanced` attributes — bare `<Gather>` only
3. `input="speech dtmf"` + `finishOnKey="#"` for name capture
4. `speechTimeout="2"` + `actionOnEmptyResult="true"` for retries
5. Retries via `<Redirect>` not multiple `<Gather>`
6. `escXml()` on all user input in `<Say>` tags
7. `express.urlencoded()` for Twilio form-encoded webhooks
8. Normalize Caller ID: strip `+1` prefix

## Validation Requirements
- `uiValidationRequired`: false (voice-only feature, no UI changes)
- `mobileValidationRequired`: false
- `apiValidationRequired`: true (all voice endpoints return valid TwiML)
- `integrationValidationRequired`: true (joinQueue + sendSms integration)
- `manualPhoneValidation`: true (at least 1 real phone call on staging)

## Quality Requirements
- All TwiML responses must be valid XML with single `<Gather>` per `<Response>`
- All user-supplied values XML-escaped before insertion into `<Say>` tags
- Feature gated behind `TWILIO_VOICE_ENABLED` env var
- Existing JSON endpoints must not break with `express.urlencoded()`
- Twilio webhook signature validation on all voice routes
- Structured JSON logging for all voice events

## Deferrals
- `Location.frontDeskPhone` configuration UI — deferred to future issue
- Twilio signature validation in production (needs real auth token) — test with skip-in-dev pattern
- Multi-language support — not in scope for Issue #31
