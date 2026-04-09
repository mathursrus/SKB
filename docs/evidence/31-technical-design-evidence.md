# Feature: Phone System Integration of Wait List
Issue: #31
Feature Spec: [docs/feature-specs/31-phone-system-integration-of-wait-list.md](../feature-specs/31-phone-system-integration-of-wait-list.md)
PR: TBD

## Completeness Evidence
- Issue tagged with label `phase:design`: Yes
- Issue tagged with label `status:needs-review`: Yes
- All files committed/synced to branch: Pending

| PR Comment | How Addressed |
|-----------|--------------|
| (No prior feedback — initial submission) | N/A |

### Traceability Matrix

| Requirement/User Story | RFC Section/Data Model | Status | Validation Plan Alignment |
|----------------------|----------------------|--------|--------------------------|
| R1: Expose Twilio Voice webhook at `POST /r/:loc/api/voice/incoming` returning TwiML | Architecture Overview diagram + API Surface Changes table (8 endpoints) + voice.ts route code | Met | API test: POST /voice/incoming → valid TwiML within 2s |
| R2: IVR greeting announces party count and ETA | voice.ts `/voice/incoming` handler calls `getQueueState()` and uses `formatEtaForSpeech()` | Met | Phone call + API test: verify greeting content |
| R3: Press 1 to join | Stateless Webhook Flow table (Step 2: menu-choice routes Digits=1 to join-name) | Met | API test: POST /voice/menu-choice with Digits=1 |
| R4: Collect name via streaming speech recognition (no recording) | voice.ts `/voice/join-name` uses `<Gather input="speech">`, voiceTemplates.ts helpers | Met | API test: POST /voice/join-size with SpeechResult |
| R5: Collect party size via DTMF (1-2 digits, 1-20) | Stateless Webhook Flow (Step 4: `<Gather input="dtmf" finishOnKey="#">`) | Met | API test: POST /voice/join-phone with Digits |
| R5a: Transfer to front desk when party size > 10 | voice.ts `/voice/transfer` uses `<Dial>`, Location.frontDeskPhone field | Met | API test: verify `<Dial>` in TwiML for size > 10 |
| R6: Read back Caller ID phone and ask for confirmation | Stateless Webhook Flow (Step 5: join-phone confirms phone via `<Gather>`) | Met | API test: verify phone readback in TwiML |
| R6a: Allow manual phone entry via DTMF | voice.ts `/voice/enter-phone` uses `<Gather input="dtmf" finishOnKey="#" numDigits="10">` | Met | API test: POST /voice/enter-phone with Digits |
| R7: Call existing `joinQueue()` to add caller | voice.ts `/voice/join-confirm` imports and calls `joinQueue()` from queue.ts service | Met | API + DB: verify queue entry created identically to web join |
| R8: Read back position, ETA, and spelled-out pickup code | voice.ts `/voice/join-confirm` uses `spellOutCode()` from voiceTemplates.ts | Met | API test: verify confirmation TwiML content |
| R9: Send standard SMS join confirmation | voice.ts `/voice/join-confirm` calls `sendSms()` + `joinConfirmationMessage()` | Met | API + SMS: verify SMS sent after phone join |
| R10: Press 2 to repeat waitlist status | Stateless Webhook Flow (Step 2: menu-choice routes Digits=2 back to incoming) | Met | API test: POST /voice/menu-choice with Digits=2 |
| R11: Handle timeout with goodbye message | voice.ts `/voice/incoming` TwiML: `<Say>Goodbye</Say><Hangup/>` after `</Gather>` | Met | API test: POST /voice/incoming without Gather |
| R12: Retry name capture up to 2 times | voice.ts `/voice/join-size` checks attempt count in query param, re-prompts or falls back | Met | API test: verify retry flow and fallback |
| R13: Validate party size 1-20 | voice.ts `/voice/join-phone` validates parsed size, re-prompts for invalid | Met | API test: size=0, size=25 → re-prompt TwiML |
| R14: Multi-tenant routing via `:loc` URL param | voiceRouter() uses `mergeParams: true`, `loc(req)` helper, mounted at `/r/:loc/api` | Met | API test: POST /r/skb-demo/api/voice/incoming → different queue |
| R15: Voice failures don't affect web/SMS | voice routes registered conditionally in mcp-server.ts, separate Router | Met | Integration test: verify JSON endpoints work after adding voice |
| R16: `TWILIO_VOICE_ENABLED` env var feature gate | mcp-server.ts: `if (process.env.TWILIO_VOICE_ENABLED === 'true')` conditional registration | Met | API test: voice routes 404 when disabled |
| Edge: Blocked Caller ID → manual phone entry | voice.ts `/voice/join-phone` checks for empty `From`, redirects to enter-phone | Met | API test: POST with empty From field |
| Edge: Party size 11-20 → front desk transfer | voice.ts `/voice/join-phone` checks size > 10, redirects to transfer | Met | API test: verify `<Dial>` response for size=15 |
| Edge: DB error during join → error message | voice.ts `/voice/join-confirm` try/catch returns error TwiML | Met | API test: mock DB failure, verify error TwiML |
| Edge: SMS fails after phone join → verbal confirmation | voice.ts sends SMS fire-and-forget after verbal confirmation already played | Met | API test: mock SMS failure, verify join still succeeds |
| Compliance: No call recording | Design specifies `<Gather input="speech">` streaming only, no `<Record>` verbs | Met | Code review: verify no `<Record>` in any TwiML |
| Compliance: Twilio signature validation | twilioValidation.ts middleware on all voice routes | Met | Unit test: valid/invalid signatures |

**Traceability Result: PASS** — All 18 requirements + 4 edge cases + 2 compliance items are Met. No Unmet rows.

### Architecture Gaps (For User Review)

| Gap | Category | Impact | Recommendation |
|-----|----------|--------|---------------|
| Inbound webhook security pattern not documented | Missing from Architecture | Low (documented in RFC, just not in architecture doc) | Add "Webhook Security" section to architecture doc during implementation |

No incorrectly followed patterns. No blocking gaps.

## Due Diligence Evidence
- Reviewed feature spec in detail: Yes (18 requirements + edge cases + compliance)
- Reviewed code base in detail: Yes (mcp-server.ts, routes/queue.ts, routes/host.ts, services/queue.ts, services/sms.ts, services/smsTemplates.ts, types/queue.ts, middleware/hostAuth.ts)
- Included detailed design, validation plan, test strategy in doc: Yes

## Prototype & Validation Evidence
- [ ] Built simple proof-of-concept that works end-to-end — N/A (no spike needed, all technologies Low/Medium uncertainty)
- [ ] Manually tested complete user flow — N/A (will be done during implementation)
- [x] Verified solution actually works before designing architecture — Issue #29 spike validated Twilio SDK integration
- [x] Identified minimal viable implementation — 3 new files, 2 modified files, no schema migration
- [x] Documented what works vs. what's overengineered — Confidence 80/100 with specific uncertainty areas documented

## Continuous Learning

| Learning | Agent Rule Updates |
|----------|-------------------|
| TwiML webhooks are stateless — state must be passed via URL query params | No rule update; documented in RFC |
| First inbound webhook in codebase — signature validation pattern needed | To be documented in architecture doc |
| express.urlencoded() needed alongside express.json() for Twilio | No rule update; documented in RFC |
