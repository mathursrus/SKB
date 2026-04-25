# Implement Work List - Issue #81

## Scope Summary

Issue #81 is a **bug**.

Observed requirement source:
- GitHub issue `#81` title: `Host chat does not go as SMS .. is that expected`
- Existing chat design and code intentionally send outbound host chat over SMS only when `queue_entries.smsConsent === true`.
- Current host UI still exposes SMS-backed actions for parties that cannot legally receive SMS, which makes the behavior look broken instead of intentional.

Working interpretation for implementation:
- Preserve TFV/TCPA-safe behavior: do **not** send host notify / custom SMS to non-consenting diners, and do not imply chat will go out as SMS when consent is absent.
- Fix the host-side product bug by making SMS eligibility explicit in the host queue surface so the host can distinguish true SMS sends from `web only` chat behavior.

## Pattern Discovery

- `smsConsent` is captured at join time and defaults to `false` for public joins.
- Host-added walk-ins default `smsConsent` to `true`, with an explicit override.
- `callParty()` and `sendChatMessage()` already gate outbound SMS on `smsConsent === true`.
- Host waiting rows are rendered from `listHostQueue()` DTOs in `src/services/queue.ts` and consumed by `public/host.js`.
- Existing UI/static tests often assert shipped JS contracts by fetching `host.js` / `queue.js` and checking for load-bearing strings.

## Checklist

- [x] `src/types/queue.ts` - extend `HostPartyDTO` with an explicit per-party SMS eligibility flag for host-only consumers.
- [x] `src/services/queue.ts` - populate the new host-only SMS eligibility field from `queue_entries.smsConsent`.
- [x] `public/host.js` - disable SMS-only actions (`Notify`, `Custom SMS`) when a party is not SMS-eligible; keep `Chat` available for the web thread.
- [x] `public/host.js` - surface concise host-facing explanation for `web only` chat and disabled SMS actions so the behavior reads as intentional, not broken.
- [x] `tests/integration/queue.integration.test.ts` or `tests/integration/host-auth.integration.test.ts` - add a failing repro-first test proving host queue data distinguishes SMS-eligible vs non-eligible parties.
- [x] `tests/ui/guest-ordering.ui.test.ts` or new host UI static test - verify the shipped `host.js` consumes the new flag and gates SMS-backed actions.
- [x] `docs/evidence/81-feature-implementation-evidence.md` - capture final verification, manual validation, and security/regression notes.

## Validation Requirements

- `uiValidationRequired: true`
- `mobileValidationRequired: false`
- Required automated validation:
  - targeted failing repro before fix
  - relevant integration/UI tests after fix
  - `npm run typecheck`
- Required manual validation:
  - host waiting row for a non-consenting party shows SMS-backed actions as unavailable with explanatory affordance
  - host waiting row for an opted-in party still allows chat/notify/custom SMS
  - no regression to call / no-show / seat actions

## Notes / Open Questions

- Issue body is empty, so the exact acceptance criteria are inferred from the title plus the existing consent design.
- If the user intended to override the consent model and send SMS without opt-in, that would be a product/compliance change, not a bug fix. This implementation will not do that.
