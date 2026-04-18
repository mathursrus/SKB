# Ad Hoc SMS Waitlist URL Fix - Implement Work List

## Scope Summary

Fix the SMS join-confirmation deep link so a diner lands on the real queue page route and can immediately see their status card from the `code` query param.

- Scope is limited to URL generation for join-confirmation SMS links.
- Both web join and voice join flows must generate the same URL.
- Validation must prove the deep link opens the queue page and resolves to the diner status view, not the blank join card.

Issue type: `bug`

## Discovered Patterns

- Public diner routes live under `/r/:loc/` and the server-rendered queue page is mounted at `/r/:loc/queue.html`.
- Backward compatibility exists only for `/queue` and `/queue.html` at the default `skb` location, not for per-location `/r/:loc/queue`.
- SMS templates accept a prebuilt status URL; route handlers currently assemble that URL inline.
- Unit tests are small `tsx` scripts under `tests/unit/`, and browser validation evidence is kept under `docs/evidence/`.

## Validation Requirements

- `uiValidationRequired: true`
- `mobileValidationRequired: false`
- `typecheckRequired: true`
- `unitTestRequired: true`
- `browserBaseline: Chromium in integrated browser`
- `targetJourney: join confirmation deep link opens /r/:loc/queue.html?code=... and renders status view`
- `evidenceArtifact: docs/evidence/adhoc-sms-waitlist-url-ui-validation.md`

## Implementation Checklist

- [ ] `src/services/queueStatusUrl.ts` - Centralize the status-link builder used in SMS flows.
- [ ] `src/routes/queue.ts` - Switch web join confirmation SMS to the shared builder.
- [ ] `src/routes/voice.ts` - Switch voice join confirmation SMS to the shared builder.
- [ ] `tests/unit/queueStatusUrl.test.ts` - Lock the `.html` deep-link requirement with a regression test.
- [ ] `docs/evidence/adhoc-sms-waitlist-url-ui-validation.md` - Record browser validation and screenshot evidence.

## Quality Requirements

- Keep the fix narrow; do not alter queue-page rendering behavior.
- Use one shared URL builder so web and voice flows stay consistent.
- Preserve existing relative in-page routing and API fetch behavior.

## Test Strategy Slice

- Unit: assert generated deep links use `/queue.html?code=...`.
- Manual browser validation: open a generated deep link and verify the diner status card is visible with the join card hidden.
