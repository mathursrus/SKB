# Issue 84 - UI Polish Validation

## Scope

Validated the host sentiment UI for issue #84 across both host-visible surfaces now in scope:

- waiting-row automatic sentiment
- waiting-row host override control
- seated-row automatic sentiment
- seated-row host override control
- mobile reachability of the seated-row control/action cluster

## Environment

- Date: 2026-04-25
- Local validation server: `http://localhost:13358`
- Browser engine: Playwright
- Desktop viewport: `1440x960`
- Mobile viewport: `390x844`
- Validation tenant: `issue-84-polish-xgk680`
- Auth path: owner named-session login at `/login`, then tenant host page at `/r/issue-84-polish-xgk680/host.html`

## Artifacts

- Screenshots
  - `docs/evidence/ui-polish/84/desktop-waiting-auto.png`
  - `docs/evidence/ui-polish/84/desktop-seated-manual.png`
  - `docs/evidence/ui-polish/84/mobile-seated-auto.png`
  - `docs/evidence/ui-polish/84/mobile-seated-actions.png`
- Browser/state artifacts
  - `docs/evidence/ui-polish/84/login-snapshot.md`
  - `docs/evidence/ui-polish/84/desktop-waiting-snapshot.md`
  - `docs/evidence/ui-polish/84/console-errors.txt`
  - `docs/evidence/ui-polish/84/network-requests.txt`
  - `docs/evidence/ui-polish/84/overflow-metrics.json`

## Results

| Journey | View | Result | Evidence |
| --- | --- | --- | --- |
| Waiting row shows automatic sentiment badge by default | Desktop | PASS - `Polish Waiting` rendered with the `Good` badge and the selector left on `Auto` | `desktop-waiting-auto.png` |
| Seated row also shows sentiment badge after seating | Desktop | PASS - `Polish Seated` remained visible on the Seated tab with the same host sentiment affordance | `desktop-seated-manual.png` |
| Host can override seated-row sentiment | Desktop | PASS - selecting `Needs attention` on the seated row persisted and re-rendered the manual badge state | `desktop-seated-manual.png` |
| Host can clear seated-row override back to automatic | Mobile | PASS - after clearing the seated-row selector back to `Auto`, the badge returned to the automatic `Good` state | `mobile-seated-auto.png` |
| Seated-row selector and lifecycle buttons remain reachable on phone width | Mobile | PASS - control cluster stayed reachable through the tab’s horizontal table scroll; no body-level overflow was introduced | `mobile-seated-actions.png`, `overflow-metrics.json` |

## Static / Deterministic Checks

- Desktop waiting snapshot confirms:
  - waiting row includes sentiment badge text and selector
  - selector is labeled `Set sentiment for Polish Waiting`
- Seated snapshot confirms:
  - seated row includes sentiment badge text and selector
  - selector is labeled `Set sentiment for Polish Seated`
- Mobile overflow metrics:
  - viewport width `390`
  - body `scrollWidth === clientWidth` (`390`)
  - seated table scroller intentionally overflows within the component (`scrollWidth 932`, `clientWidth 342`) without causing page-level overflow

## Console / Network Health

- Network audit: PASS
  - host page, theme, styles, scripts, and host API calls all returned `200`/`304`
  - sentiment update POSTs returned `200`
- Console audit: PASS with one non-blocking asset miss
  - observed `404` for `favicon.ico`
  - no JavaScript runtime errors tied to the issue-84 sentiment changes

## Automated Validation

- `npm run typecheck` - PASS
- `npm run build` - PASS
- `npx tsx --test --test-concurrency=1 tests/integration/queue.integration.test.ts` - PASS
- `npx tsx --test --test-concurrency=1 tests/integration/host-auth.integration.test.ts` - PASS
- `npx tsx --test --test-concurrency=1 tests/integration/dining-transitions.integration.test.ts` - PASS
- `npx tsx --test --test-concurrency=1 tests/ui/host-sentiment.ui.test.ts` - PASS

## Defect Triage

- P0/P1 defects: none
- P2/P3 observations:
  - The host table continues to rely on horizontal component scrolling on phone-width viewports. This is existing host-surface behavior and remained usable after the seated sentiment control was added.
  - Missing `favicon.ico` logs a single `404` in the browser console but does not affect host sentiment behavior.

## Signoff

- UI polish verdict for the seated-state sentiment expansion: PASS
- Blocking polish defects requiring a fix-and-regression loop: none
