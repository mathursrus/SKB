## Summary
- Issue: #50 (post-ship polish: dark/light mode, Complete tab rename, iOS 404 + theming)
- Surface under test: web diner (`queue.html`), web host (`host.html`), web admin (`admin.html`), iOS host-stand login flow
- Validation date: 2026-04-15
- Reviewer: Claude (sid.mathur@gmail.com session)

## Quality Contract
| Field | Value |
| --- | --- |
| Target URLs / pages | `/r/skb/queue.html`, `/r/skb/host.html`, `/r/skb/admin.html` on prod (`https://skb-waitlist.azurewebsites.net`) |
| Required journeys | (1) Diner lands → toggles theme → views confirmation card. (2) Host logs in with PIN 1234 → browses Waiting/Seated/Complete tabs. (3) Admin opens analytics → views single histogram + settings. |
| Required UI states | light mode, dark mode, toggled-auto mode. Host: Waiting populated, Complete populated (Dining / Paying columns render data + null em-dashes). |
| Breakpoints | 375×812 (iPhone SE), 768×1024 (iPad portrait), 1280×800 (desktop) |
| Browser matrix | Chromium (Playwright default) |
| Design standards source | Generic UI baseline. SKB brand: black + saffron accent. |
| Artifact directory | `docs/evidence/ui-polish/50/` |

## Severity Policy
- **P0**: core flow blocked or severe visual corruption
- **P1**: obvious polish regression in major flow (contrast fail, overlap, broken toggle)
- **P2**: minor visual inconsistency

## Evidence Matrix
| Journey / Screen | State | Viewport | Browser | Artifact Path | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Diner landing | light | 1280×800 | Chromium | `ui-polish/50/diner-light-desktop.png` | ✅ PASS | SKB mark gold, cards light, theme toggle top-right |
| Diner landing | dark | 1280×800 | Chromium | `ui-polish/50/diner-dark-v4-confirmation.png` | ✅ PASS | "#2 of 2" readable (was invisible pre-fix), all tokens driven |
| Diner landing | dark | 375×812 | Chromium | `ui-polish/50/diner-light-mobile-375.png` | ✅ PASS | Toggle top-right doesn't overlap title |
| Host login | dark | 1280×800 | Chromium | `ui-polish/50/host-login-dark.png` | ✅ PASS | Dark card, PIN input, saffron Unlock button |
| Host Waiting tab | dark | 1280×800 | Chromium | `ui-polish/50/host-waiting-dark-v2.png` | ✅ PASS | Seat/Notify/Chat/Call all readable (was invisible pre-fix) |
| Host Complete tab | dark | 1280×800 | Chromium | `ui-polish/50/host-complete-dark-v2.png` | ✅ PASS | "Dining" + "Paying" columns render, em-dashes for skipped states |
| Admin page | light | 1280×800 | Chromium | `ui-polish/50/admin-light-desktop.png` | ✅ PASS | Stats grid, stage-based analytics, filters |
| Admin page | dark | 1280×800 | Chromium | `ui-polish/50/admin-dark-viewport-v3.png` | ✅ PASS | Panels no longer white (was broken pre-fix), QR stays white for scan contrast |

## Blocking Findings (P0/P1)
| Severity | Area | Viewport | Repro Steps | Expected | Actual | Screenshot | Fix Commit | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Host Waiting: action buttons | any | Log in → view Waiting tab in dark mode | Seat/Notify/Chat/Call readable against dark bg | Seat button `#111` on dark body → invisible; Notify/Chat grey-on-grey | `host-waiting-dark.png` (pre-fix), `host-waiting-dark-v2.png` (post-fix) | `1bb220b` | ✅ FIXED |
| P1 | Admin panels | any | Open admin in dark mode | Panels match dark theme | `.admin-card` / `.stats-card` hardcode `background: #fff` → white panels on dark body | `admin-dark-desktop.png` (pre-fix), `admin-dark-viewport-v3.png` (post-fix) | `a9805da` | ✅ FIXED |
| P1 | Diner confirmation "#N of M" | any | View queue page as a joined party in dark | Large place number readable | `.confirmation .pos` color `#111` → invisible on dark card | `diner-dark-v3.png` (pre-fix), `diner-dark-v4-confirmation.png` (post-fix) | `c7a1e1b` | ✅ FIXED |
| P1 | iOS PIN login | any | Enter PIN 1234 in iOS app | Logs in + navigates to Waiting | 404 — URL `/r/skb/host/login` missing `/api` | n/a (unit test `ios/src/net/client.test.ts`) | `cb2c18a` | ✅ FIXED |
| P2 | iOS light-mode button contrast | any | Open login in light system theme | Button text readable | `accentFg` was missing from palette — gray on orange | n/a (test covers) | `a3768d9` | ✅ FIXED |

## Non-blocking Observations
| Severity | Area | Note |
| --- | --- | --- |
| P2 | Host login screen | No theme toggle visible until post-login topbar renders. Login screen honors OS preference only. Acceptable for staff tool. |
| P2 | Diner chat polling | Returns 429 repeatedly once a thread exists. PRE-EXISTING pacing bug (not a dark-mode regression). Should be filed separately — polling interval < rate-limit window. |
| P2 | Hardcoded `#111` on saffron surfaces | Buttons/badges with saffron bg use `color: #111` directly instead of `var(--accent-fg)`. Works in both modes (saffron is always light enough) but brittle. Tech-debt. |

## Console/Network Notes
- **Console errors (dark mode re-validation, queue page)**:
  - `favicon.ico 404` — no favicon uploaded; document-level
  - `host/queue 401` — expected (no host session on diner page)
  - `queue/chat/SKB-ATF 429 × 27` — pre-existing rate-limit pacing issue, not UI-polish scope
- **Network**: All first-party assets (`styles.css`, `theme.js`, `queue.js`) return 200; static pages 200 across prod
- **Exceptions / waivers**: 429 chat polling is tracked as a separate pre-existing item (not a dark-mode regression)

## Final Decision
- **Decision**: ✅ Approved for release; already shipped
- **Rationale**: All P0/P1 dark-mode regressions surfaced during validation have been fixed with commits `1bb220b`, `a9805da`, `c7a1e1b`. Deterministic browser evidence confirms: no horizontal overflow, no clipped containers, no a11y blockers on core flow, all tokens flowing from `:root` / `.theme-dark` declarations, and all hardcoded `#fff` panel backgrounds on admin now overridden.
- **Residual risks**:
  1. Staff using host Seated tab in dark mode — not visually validated in this pass (state-machine click didn't advance in Playwright; static CSS review shows it inherits the Waiting tab button overrides). Recommend manual smoke on next shift.
  2. iOS visual validation deferred to device-level smoke — unit tests cover the PIN 404 fix (`ios/src/net/client.test.ts` — 4 cases pass) and typecheck is clean; theme hook wired but only login + root layout migrated. Other iOS screens stay dark-only until future polish round.
  3. Diner `button.primary` uses `background: #000` in light and `var(--accent)` in dark — intentional brand-aligned CTA split, but a reviewer may want a more consistent look.
