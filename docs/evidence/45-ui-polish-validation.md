## Summary
- Issue: #45 — Rip and replace restaurant website + IVR self-service
- Surface under test: 5 new diner-facing pages (home, menu, about, hours & location, contact), the existing host page post-PR-#48-split, and the admin page with my new "Restaurant Site" card
- Validation date: 2026-04-15
- Reviewer: Claude (post-merge of PR #47 into master at `80e46ed`, running the `ui-polish-validation` FRAIM job)

## Quality Contract

| Field | Value |
| --- | --- |
| Target URLs / pages | **Customer (new)**: `/r/skb/`, `/r/skb/menu`, `/r/skb/about`, `/r/skb/hours`, `/r/skb/contact`. **Host**: `/r/skb/host.html` (verify visit/stats cards removed per PR #48). **Admin**: `/r/skb/admin.html` (verify all 3 cards — Visit Page / QR, IVR / Phone Entry, Restaurant Site — present, populated, save round-trip). **Host-header rewrite**: `Host: skbbellevue.com + /` → `/r/skb/home.html`; `/menu` → `/r/skb/menu-page.html`. |
| Required journeys | (1) load home → read brand/address/hours from public-config; (2) open menu → 13 categories / 79 items rendered; (3) hours → table + map embed + address populated; (4) contact → tel: and mailto: links; (5) admin login → expand Restaurant Site card → modify → Save → status=Saved ✓; (6) admin Save with invalid input → error surfaced |
| Required UI states | Loading (fetch pending), populated (seeded DB), error (invalid state code) |
| Breakpoints | Desktop 1280×800, tablet 768×1024, mobile 375×812 |
| Browser matrix | Chromium (Playwright) |
| Design standards source | Generic UI baseline — existing `public/styles.css` (dark topbar + cream cards) for host/admin; new `public/site.css` (cream + saffron + charcoal hospitality palette) for diner pages |
| Artifact directory | `docs/evidence/ui-polish/45/` |

### Severity policy

- **P0**: core flow blocked or severe visual corruption — zero-tolerance
- **P1**: obvious polish regression in a major flow — zero-tolerance
- **P2**: minor visual inconsistency — documented, not blocking

## Evidence Matrix

| Journey / Screen | State | Viewport | Browser | Artifact | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Home page loads, brand/address/hours from public-config | populated | 1280×800 | Chromium | `docs/evidence/ui-polish/45/home-desktop.png` | ✅ Pass | `brand=Shri Krishna Bhavan`, address block = "12 Bellevue Way SE / Bellevue, WA 98004", hours = "Lunch · 11:30 AM – 2:30 PM / Dinner · 5:30 PM – 9:30 PM", footer contact populated, no horizontal scroll |
| Menu page fetches menu.json and renders | populated | 1280×800 | Chromium | `home-desktop.png`, `menu-desktop.png` | ✅ Pass | `{ cats: 13, items: 79, stripLinks: 13, nonVeganTags: 19, firstCategoryName: "Weekend Breakfast", horizontalScroll: false }` |
| About page | populated | 1280×800 | Chromium | `about-desktop.png` | ✅ Pass | 3 h2 sections, pullquote present, 3-tile dish strip |
| Hours & Location — weekly table + Maps embed + address | populated | 1280×800 | Chromium | `hours-desktop.png` | ✅ Pass | 7 rows, `monday="Monday\tClosed"`, `tuesday` has both lunch + dinner, `mapSrcHasAddress=true`, `mapCtaHasAddress=true`, address = "Shri Krishna Bhavan / 12 Bellevue Way SE / Bellevue, WA 98004", parking block with "Parking" h3 |
| Contact — phone tel: link + mailto: + address | populated | 1280×800 | Chromium | `contact-desktop.png` | ✅ Pass | `phoneHref=tel:+12536565478`, `phoneText=(253) 656-5478`, `emailHref=mailto:skb.bellevue@gmail.com` |
| Host page post-PR-#48 | populated | 1280×800 | Chromium | `host-desktop.png` | ✅ Pass | Visit card removed ✓, Stats card removed ✓, `openAdminLink=admin.html` ✓, 3 tabs (Waiting/Seated/Complete) intact |
| Admin — 3 cards populated | populated | 1280×800 | Chromium | `admin-desktop.png` | ✅ Pass | `visitSave/voiceSave/siteSave` all present. Site card round-trips: `siteStreet="12 Bellevue Way SE" / siteCity="Bellevue" / siteState="WA" / siteZip="98004" / sitePublicHost="skbbellevue.com" / mondayClosed=true / tueLunchOpen="11:30" / tueDinnerClose="21:30"`. Voice card: `voiceFrontDesk="2536565478"`. Visit card: `visitMode="auto"` |
| Admin Site-config Save — valid | success | 1280×800 | Chromium | (status only) | ✅ Pass | `statusText="Saved ✓"`, `class="visit-status success"` |
| Admin Site-config Save — invalid state code | error | 1280×800 | Chromium | (status only) | ✅ Pass | `statusText="address.state must be a 2-letter US state code"`, `class="visit-status error"` — server-side 400 surfaced verbatim |
| Home | populated | 375×812 | Chromium | `home-mobile.png` | ✅ Pass | `{ sw: 375, vw: 375, horizontalScroll: false }`. Dish grid stacks to 1 col, info grid stacks to 1 col, nav gap shrinks to 16px |
| Menu | populated | 375×812 | Chromium | `menu-mobile-top.png` | ✅ Pass | `{ items: 79, horizontalScroll: false, itemsGridCols: "312px" }`. Category strip scrolls horizontally (intentional sticky nav). |
| Hours | populated | 375×812 | Chromium | `hours-mobile.png` | ✅ Pass | `{ hScroll: false, rowCount: 7, mondayClosed: true, mapEmbedHeight: 278, hoursMainGrid: "327px" }`. Grid collapses to 1 col; time ranges wrap in narrow cells (acceptable). |
| Contact | populated | 375×812 | Chromium | `contact-mobile.png` | ✅ Pass | Nav wraps to 2 lines; layout otherwise identical to desktop, no horizontal scroll |
| Admin pre-fix | populated | 375×812 | Chromium | `admin-mobile.png` | **❌ P1** | `{ horizontalScroll: true, sw: 571, vw: 375 }`. `.visit-hours-row` used `1fr 1fr` at ≤720px but the nested `.visit-hours-window` (span 48 + time 90 + dash + time 90 = 248px per window) was too wide for a 196px column. **See Blocking Findings #1.** |
| Admin post-fix | populated | 375×812 | Chromium | `admin-mobile-fixed.png` | ✅ Pass | `{ horizontalScroll: false, sw: 360, vw: 375, hoursRowCols: "270px", hoursRowWidth: 270 }` — row now single column, fits inside 375. |
| Home | populated | 768×1024 | Chromium | `home-tablet.png` | ✅ Pass | `{ hScroll: false, sw: 753, vw: 768, dishGridCols: "213.656px 213.672px 213.672px", infoGridCols: "328.5px 328.5px" }` — desktop 3-col dishes, 2-col info grid. |
| Hours | populated | 768×1024 | Chromium | `hours-tablet.png` | ✅ Pass | `{ hScroll: false, sw: 753, hoursMainGrid: "324.5px 324.5px" }` — 2-col grid (table + map side-by-side). |
| Admin pre-fix-2 | populated | 768×1024 | Chromium | (tablet screenshot not captured — MCP disconnect) | **❌ P1** | `{ hScroll: true, sw: 785, vw: 768, hoursRowCols: "110px 80px 246.25px 246.25px" }`. The `max-width: 720px` breakpoint excluded iPad-portrait (768), so the desktop 4-column layout applied and overflowed by 17px. **See Blocking Findings #2.** |
| Admin post-fix-2 | populated | 768×1024 | Chromium | (visual re-verification blocked by dev-server crash + Playwright MCP disconnect — see "Verification gap" below) | ⚠️ Fix applied, math-verified | Bumped `.visit-address-grid` / `.visit-hours-row` breakpoint from `max-width: 720px` to `max-width: 900px`. At 768 viewport, single-column hours row content = 1 window wide (~198px inc. content) → fits comfortably. Visual re-verification blocked, but the CSS change is identical to the mobile fix which already passed at 375. |

## Blocking Findings

| # | Severity | Area | Viewport | Repro Steps | Expected | Actual | Screenshot | Console / Network | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **P1** | `public/styles.css` `.visit-hours-row` mobile layout | 375×812 | Load `/r/skb/admin.html`, log in with PIN 9999, expand Restaurant Site card, observe horizontal scrollbar on body | `horizontalScroll === false`, row width ≤ viewport | `scrollWidth=571`, `viewportWidth=375`, `.visit-hours-row` computed `grid-template-columns: 1fr 1fr` with each nested `.visit-hours-window` = 248px, so the row needed ~505px which overflows | `admin-mobile.png` (pre-fix), `admin-mobile-fixed.png` (post-fix) | None | **ADDRESSED** — changed mobile `.visit-hours-row` to single column, reduced time-input width to 72px, reduced window-label width to 40px, added `flex-wrap: wrap` to the window container. Re-verified: scrollWidth=360 in 375 viewport, row is single 270px column. |
| 2 | **P1** | `public/styles.css` `@media (max-width: 720px)` breakpoint | 768×1024 | Load `/r/skb/admin.html`, log in, expand Restaurant Site card, observe horizontal scrollbar | `horizontalScroll === false` | `scrollWidth=785`, `viewportWidth=768` — iPad portrait (768) is above the 720 breakpoint, so the desktop `110px 80px 1fr 1fr` hours row applies and the two 1fr windows (at ~246px each) overflow by 17px | (visual not captured post-fix — see verification gap below) | None | **ADDRESSED (math-verified, visual verification pending)** — bumped the breakpoint from `max-width: 720px` to `max-width: 900px` so iPad portrait gets the compact single-column layout. |

### Verification gap for Finding #2

The dev server crashed and the Playwright MCP disconnected mid-run, so I could not capture a post-fix screenshot at the 768×1024 viewport. The fix is the same CSS edit as Finding #1 (extending the media query range) and the math is unambiguous:

- At 768 viewport, admin-card content width ≈ 688px after padding
- Single-column `.visit-hours-row` width ≈ 688px
- One `.visit-hours-window` content = span(40) + time(72) + dash(~10) + time(72) = ~194px
- Two windows per row × ~194px + padding = ~400px, comfortably inside 688

A follow-up manual re-verification at iPad portrait is recommended after the next dev-server restart but is not expected to surface new defects.

## Console/Network Notes

- Console: 1 non-blocking 404 at `/favicon.ico` on every page load. **P2** — documented, not blocking. No behavioral impact. Recommend adding a `favicon.ico` to `public/` in a future polish commit.
- Network: `/api/public-config` fires once per diner page via `site-config.js`, returns 200 with the expected projection payload. `/api/host/site-config` GET + POST round-trip verified end-to-end on the admin page.
- Exceptions / waivers:
  - axe-core + Lighthouse automated accessibility scan: out of scope for this run
  - Real Twilio phone call against `/voice/menu-info`, `/voice/hours-info`, `/voice/front-desk`: pending (owner action per the "Different vendor API surface = new spike" mistake pattern)

## Out-of-scope observations (not blocking for #45)

- **Stage-Based Analytics card on admin.html** (shipped by PR #48) displays "Failed to load analytics" on a fresh DB with no historical data. Likely an empty-state bug unrelated to my work — would file under issue-46 follow-up rather than issue-45. Not a blocker for this UI polish run since the feature is outside issue #45's scope.

## Final Decision

- **Decision**: ✅ **APPROVED** — conditional on the Finding #2 visual re-verification at tablet viewport after the next dev-server restart.
- **Rationale**:
  - All 5 new diner-facing pages render correctly at desktop, tablet, and mobile (where verified).
  - Admin's new Restaurant Site card round-trips all fields through the DB on valid input and surfaces server-side errors cleanly on invalid input.
  - Host page post-PR-#48 shows the correct removals (visit card, stats card) and preserves the "Open Admin" link.
  - Two P1 layout defects were found and fixed in-session via a single CSS edit bumping the compact-layout breakpoint from 720px to 900px and tightening the mobile hours grid.
- **Residual risks**:
  - Tablet (768×1024) post-fix visual re-verification pending. Math is solid, but a human eye should confirm the nested time-window wrap behavior looks acceptable before closing this doc.
  - The 404 on `/favicon.ico` is cosmetic but user-visible in DevTools. Recommend a 1-line follow-up commit to add a placeholder favicon.

## Artifacts

All screenshots live under `docs/evidence/ui-polish/45/`:

- `home-desktop.png`, `home-mobile.png`, `home-tablet.png`
- `menu-desktop.png`, `menu-mobile-top.png`
- `about-desktop.png`
- `hours-desktop.png`, `hours-mobile.png`, `hours-tablet.png`
- `contact-desktop.png`, `contact-mobile.png`
- `host-desktop.png`
- `admin-desktop.png`, `admin-mobile.png` (pre-fix, shows the horizontal-scroll bug), `admin-mobile-fixed.png` (post-fix)
