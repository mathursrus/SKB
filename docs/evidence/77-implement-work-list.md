# Issue 77 - Implement Work List

## Issue Summary
- GitHub issue: `#77` - `Users on mobile should have numbers auto-filled in`
- Issue body: mobile diners currently have to type their phone number manually even when joining from a mobile device.
- Issue type: `bug`
- Scope intent: enable browser-level mobile phone autofill on the diner join form without changing the queue API contract.

## Standing Work List
- [ ] `public/queue.html` - add the mobile autofill metadata browsers use for phone numbers on the diner join field.
- [ ] `tests/unit/mobilePhoneAutofill.test.ts` - add a regression test that locks the join-form phone field contract to mobile autofill-friendly attributes.
- [ ] Validation - run the new unit test, run the relevant existing queue HTML regression test coverage, and run a TypeScript build check.
- [ ] Manual validation - verify on a mobile device profile that the phone field now offers autofill and still submits a valid 10-digit number.

## Validation Requirements
- `uiValidationRequired`: true
- `mobileValidationRequired`: true
- Browser validation: Chrome latest on desktop for regression smoke on `queue.html`
- Mobile validation: Chrome mobile emulation (or equivalent mobile device profile) on the diner join flow
- Evidence artifact: `docs/evidence/77-ui-polish-validation.md`

## Context Notes
- No linked feature spec or RFC was referenced from issue `#77`.
- Current branch: `feature/77-users-on-mobile-should-have-numbers-auto-filled-in`
- The join API already accepts `phone` as a required 10-digit string; the issue is in the client-side form contract, not the server route.
- Implementation decision: follow the repo's existing phone-field pattern from `public/admin.html` by adding `name="phone"` and `autocomplete="tel"` to the diner join input.

## Discovered Patterns
- Public HTML regressions are covered with file-string unit tests that read directly from `public/*.html` and assert exact DOM hooks or attributes. See `tests/unit/bug50Regression.test.ts`.
- Diner join UI lives in `public/queue.html` and `public/queue.js`; server validation for join payloads lives in `src/routes/queue.ts`.
- Existing form fields already use browser autofill hints where appropriate in other pages, such as `public/admin.html` with `autocomplete="tel"` for phone fields.
- Project tests use `tests/test-utils.ts` with `runTests(cases, title)` and lightweight boolean-returning test cases.
- Environment/config pattern remains unchanged for this issue; no new env vars, constants, or backend utilities are needed.

## Open Questions / Deferrals
- Mobile browser autofill depends on device/browser support and the user's saved contact info. This fix can make autofill available, but cannot guarantee every mobile browser will pre-populate the field automatically.
