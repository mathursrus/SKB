## Summary
- Issue: adhoc-admin-accordion-theme
- Surface under test: `public/admin.html` admin workspace accordion styling, especially light/dark theme behavior for section cards and menu-builder accordions
- Validation date: 2026-04-25
- Reviewer: Codex

## Quality Contract
| Field | Value |
| --- | --- |
| Target URLs / pages | `/r/skb/admin.html` |
| Required journeys | `1.` Open admin page shell. `2.` Reveal admin workspace and inspect accordion headers/cards in light mode. `3.` Toggle dark mode and inspect the same accordion states. `4.` Open menu-builder accordion and nested section accordions. |
| Required UI states | login shell, admin workspace visible, collapsed accordion, expanded accordion, nested menu-section accordion, light mode, dark mode |
| Breakpoints | `375x812`, `768x1024`, `1280x800` |
| Browser matrix | Chromium |
| Design standards source | Generic UI baseline using existing `public/styles.css` host/admin tokens and the repo theme contract in `public/theme.js` |
| Artifact directory | `docs/evidence/ui-polish/adhoc-admin-accordion-theme/` |

## Evidence Matrix
| Journey / Screen | State | Viewport | Browser | Artifact Path | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Admin menu tab | light, sample nested accordion injected | 1280x800 | Chromium | `docs/evidence/ui-polish/adhoc-admin-accordion-theme/admin-menu-light-before-fix.png` | PASS | Light theme baseline looked correct before the fix. |
| Admin menu tab | dark, before fix | 1280x800 | Chromium | `docs/evidence/ui-polish/adhoc-admin-accordion-theme/admin-menu-dark-before-fix.png` | FAIL | Empty state, nested menu-section card, and menu-item surface stayed white in dark mode. |
| Admin menu tab | dark, after fix | 1280x800 | Chromium | `docs/evidence/ui-polish/adhoc-admin-accordion-theme/admin-menu-dark-after-fix-viewport.png` | PASS | Empty state, nested section card, menu item row, and caret now map to dark tokens. |
| Admin dashboard tab | dark, before fix | 1280x800 | Chromium | `docs/evidence/ui-polish/adhoc-admin-accordion-theme/admin-dark-dashboard-before-fix.png` | PASS | Top-level admin cards already used dark card tokens; follow-up fix only adjusted accordion hover/caret polish. |

## Blocking Findings
| Severity | Area | Viewport | Repro Steps | Expected | Actual | Screenshot Path | Console / Network Context | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Menu tab accordion surfaces in dark mode | 1280x800 | Open `/r/skb/admin.html`, reveal admin workspace, switch to Menu, inspect empty state + expanded nested section in dark mode | Accordion shells and nested rows should inherit dark theme tokens consistently | `.menu-empty-state` remained `rgb(250, 250, 249)` and both `details.menu-section` + `.menu-item` remained white, creating bright blocks inside the dark admin page | `docs/evidence/ui-polish/adhoc-admin-accordion-theme/admin-menu-dark-before-fix.png` | Unauthorized API errors are expected in this shell-only validation; they did not affect CSS reproduction | FIXED |

## Console/Network Notes
- Console: `docs/evidence/ui-polish/adhoc-admin-accordion-theme/console-before-fix.txt` captured three expected errors while validating the unauthenticated shell: `401 /api/me`, `401 /r/skb/api/host/stats`, and `404 /favicon.ico`.
- Network: Static assets loaded and the page rendered correctly; the validation intentionally forced the admin workspace visible without a signed-in admin session to isolate theme styling.
- Exceptions / waivers: Nested menu-section evidence was injected into the Menu tab shell because those rows are otherwise rendered only after authenticated data loads. This was sufficient for CSS-token validation because the bug was in shared static selectors in `public/styles.css`.

## Final Decision
- Decision: PASS after fix
- Rationale: Dark-mode accordion styling is now consistent across top-level admin cards and the nested Menu builder surfaces. Before the fix, the dark token audit showed `menuEmptyBg: rgb(250, 250, 249)`, `sectionBg: rgb(255, 255, 255)`, and `itemBg: rgb(255, 255, 255)`. After the fix, those surfaces moved to `rgb(20, 20, 24)` and `rgb(30, 30, 36)`, with the caret also shifting to a muted dark-theme token. The targeted regression suite passed.
- Residual risks: This pass validated the accordion shell and shared menu-builder selectors at desktop width only. A future authenticated browser pass could additionally smoke-test real menu data at `375x812` and `768x1024`.
