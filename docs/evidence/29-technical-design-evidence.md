# Feature: SMS Users When Host Calls Them
Issue: #29
Feature Spec: [docs/feature-specs/29-sms-users-when-host-calls-them.md](../feature-specs/29-sms-users-when-host-calls-them.md)
PR: https://github.com/mathursrus/SKB/pull/32

## Completeness Evidence
- Issue tagged with label `phase:design`: Yes
- Issue tagged with label `status:needs-review`: Yes
- All files committed/synced to branch: Yes

| PR Comment | How Addressed |
|-----------|---------------|
| *(No prior design feedback)* | N/A |

### Traceability Matrix

| Requirement/User Story | RFC Section/Data Model | Status | Validation Plan Alignment |
|------------------------|----------------------|--------|--------------------------|
| R1: Required full US phone number (10 digits) | Data Model: `phone: string` replaces `phoneLast4`; API: validateJoin updated | Met | API: POST /queue/join with valid/invalid/empty phone |
| R2: Validate phone as exactly 10 digits | API Surface: validateJoin regex `^\d{10}$` | Met | API: POST /queue/join with "abc" → 400 |
| R3: Confirmation SMS with status page link on join | Architecture: fire-and-forget after joinQueue(); Templates: `joinConfirmationMessage()` | Met | API: POST /queue/join → verify SMS sent (E2E with Twilio test creds) |
| R4: SMS on each host call | callParty() updated: reads entry, sends SMS, pushes CallRecord | Met | API: POST /host/queue/:id/call → {smsStatus: "sent"} |
| R5: SMS includes call count | callParty(): `callCount = calls.length + 1`; Templates: `repeatCallMessage(code, callCount)` | Met | API: call twice, verify calls[] has 2 records with correct count |
| R6: Polite, friendly repeat call tone | Templates: "Just a friendly reminder — we've called your name N times" | Met | Unit test: verify template output matches expected text |
| R7: Host dashboard masks phone | Data Model: `phoneMasked` in HostPartyDTO; `maskPhone()` helper | Met | API: GET /host/queue → verify phoneMasked format |
| R8: SMS failures don't block call | callParty(): sendSms in try/catch, DB update always runs regardless | Met | API: with invalid Twilio creds → {ok: true, smsStatus: "failed"} |
| R9: Helper text on join form | UI Changes: queue.html phone field + "We'll text you when your table is ready." | Met | Browser: verify helper text visible |
| R10: Host checkmark/X for SMS status | Data Model: CallRecord.smsStatus; API: call returns smsStatus; UI: host.js renders icon | Met | Browser: click Call → verify checkmark/X appears |

## Due Diligence Evidence
- Reviewed feature spec in detail: Yes
- Reviewed codebase in detail: Yes (queue.ts, host.ts, queue routes, types, frontend)
- Included detailed design, validation plan, test strategy in doc: Yes

## Prototype & Validation Evidence
- [x] Built simple proof-of-concept that works end-to-end (spike/twilio-sms-spike.ts)
- [x] Manually tested complete user flow (Twilio test credentials + magic numbers)
- [x] Verified solution actually works before designing architecture
- [x] Identified minimal viable implementation (synchronous create() + catch, no webhooks)
- [x] Documented what works vs. what's overengineered (polling/webhooks unnecessary)

## Continuous Learning

| Learning | Agent Rule Updates |
|----------|-------------------|
| Azure startup credits can't purchase PSTN phone numbers — need pay-as-you-go billing | None — tracked in #33 |
| Twilio create() returns status synchronously — no polling/webhooks needed for basic delivery indicator | None — spike finding documented in RFC |
| User prefers simplicity and leveraging existing credits over sophisticated solutions | fraim/personalized-employee/learnings/raw/sid.mathur@gmail.com-2026-04-08T01-00-00-prefer-simplicity-and-credits.md |
