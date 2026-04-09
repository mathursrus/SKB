# Feature Implementation: SMS Users When Host Calls Them
Issue: #29
Feature Spec: [docs/feature-specs/29-sms-users-when-host-calls-them.md](../feature-specs/29-sms-users-when-host-calls-them.md)
RFC: [docs/rfcs/29-sms-users-when-host-calls-them.md](../rfcs/29-sms-users-when-host-calls-them.md)
PR: https://github.com/mathursrus/SKB/pull/32

## Completeness Evidence
- Issue tagged with label `phase:design`: Yes
- Issue tagged with label `status:needs-review`: Yes
- All files committed/synced to branch: Yes

### Traceability Matrix

| Requirement | Implemented File/Function | Proof (Test/Evidence) | Status |
|------------|--------------------------|----------------------|--------|
| R1: Required full phone (10 digits) | `src/types/queue.ts` (QueueEntry.phone), `src/routes/queue.ts` (validateJoin) | Integration: `join: empty queue → position 1` (passes with phone) | Met |
| R2: Validate phone as 10 digits | `src/routes/queue.ts` validateJoin: `/^\d{10}$/` | Integration: join tests pass only with valid phone | Met |
| R3: Confirmation SMS on join | `src/routes/queue.ts` join route: fire-and-forget sendSms | `sms.not_configured` warn in integration test logs confirms path executes | Met |
| R4: SMS on each host call | `src/services/queue.ts` callParty(): sendSms before updateOne | Integration: `listHostQueue returns parties with state and call history` | Met |
| R5: Call count in SMS | `src/services/queue.ts` callParty(): `callCount = calls.length + 1` | Unit: `repeatCallMessage with count 2` | Met |
| R6: Polite repeat call tone | `src/services/smsTemplates.ts` repeatCallMessage | Unit: `repeatCallMessage includes call count and friendly tone` | Met |
| R7: Host masks phone | `src/services/queue.ts` listHostQueue: `maskPhone(d.phone)` | Unit: `maskPhone masks all but last 4 digits` | Met |
| R8: SMS failures don't block call | `src/services/queue.ts` callParty(): sendSms catch, updateOne always runs | Design: try/catch wraps sendSms, DB update is unconditional | Met |
| R9: Helper text on form | `public/queue.html`: "We'll text you when your table is ready." | File inspection: HTML contains helper div | Met |
| R10: Host checkmark/X indicator | `public/host.js`: reads `c.smsStatus`, renders ✓/✗ | `src/routes/host.ts` returns `smsStatus` in call response | Met |

**Result: 10/10 Met — PASS**

## Due Diligence Evidence
- Reviewed feature spec in detail: Yes
- Reviewed RFC in detail: Yes
- Reviewed codebase in detail: Yes
- Ran Twilio spike before implementation: Yes

## Test Results
- TypeScript compilation: Clean (npx tsc --noEmit)
- Unit tests: 89 pass, 0 fail (npm test + new sms/smsTemplates tests)
- Integration tests: 44+ pass, 0 fail (npm run test:integration)
- No regressions introduced

## Key Implementation Decisions
1. `callParty()` sends SMS synchronously (await) before DB update so smsStatus is available, but DB update always proceeds regardless of SMS result
2. Join confirmation SMS is fire-and-forget (no await, catch logged) to avoid blocking the join response
3. Twilio client is instantiated per-call (not singleton) for simplicity — acceptable at restaurant scale
4. `+1` prefix for US country code is hardcoded in sms.ts — acceptable for US-only MVP

## Deferrals
- Real Twilio phone number provisioning (requires account upgrade)
- ACS migration (#33)
- 10DLC registration (parallel track)
- Browser UI validation deferred to PR review
