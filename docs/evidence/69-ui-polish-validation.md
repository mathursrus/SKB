# UI Polish Validation — Issue #69

> **⚠️ ERRATA — 2026-04-24:** This document is **invalid as UI polish evidence**.
> It was produced against the static design mock, not a real running feature.
> A proper `ui-polish-validation` phase requires Playwright to drive a live
> user-facing surface the feature actually exposes; this PR defers the admin
> Settings → Messaging page and the join-form consent-copy update, so **no
> such surface exists yet**. The content below is retained as a mock-level
> sanity review (legitimate at spec time; not a substitute for polish). A
> real UI polish run will be filed when the admin wiring lands.
>
> *Root-cause analysis and coaching moment:
> `fraim/personalized-employee/learnings/raw/sid.mathur@gmail.com-2026-04-24T03-04-02-validate-real-ui-not-mocks.md`.*

**Surface (retained for reference):** `docs/feature-specs/mocks/69-admin-sms-settings.html` (static admin Settings → Messaging mock)
**Tool:** Playwright MCP via `localhost:8077`
**Date:** 2026-04-23
**Design standards:** Generic UI baseline (no project-specific design system configured in `fraim/config.json`).

## Scope

The implementation merged to PR #70 is **backend-only**. The admin UI is not yet wired to server state — the only UI artifact in scope is the static mock that drives the spec/design intent. Validation here is therefore about the mock's fitness as a guide for the real admin wiring later, not about a shipped UI.

## Quality contract

- Desktop baseline renders without clipping, overlap, or horizontal scrolling.
- Live-preview wiring (display-name edits propagate to all preview surfaces) works end-to-end.
- Empty-state and over-limit paths degrade gracefully.
- Interactive controls (Save, Send test, Upgrade options) are discoverable and functional.
- No console errors beyond benign favicon-404.

## Evidence captured

| # | Artifact | Viewport | What it shows |
|---|---|---|---|
| 1 | `ui-polish/69/desktop-default.png` | 1920×893, `Shri Krishna Bhavan` | Default render, top of page — sidebar, Messaging highlighted, sender-name card, live preview bubbles, save bar. |
| 2 | `ui-polish/69/desktop-bottom.png` | 1920×893, scrolled to end | Sending-number read-only card, Voice & IVR card with sample greeting + front-desk transfer reference, "Other upgrade options" disclosure. |
| 3 | `ui-polish/69/desktop-overflow-count.png` | 1920×893, input programmatically set to 49 chars | Counter reads `49 / 30` with no visual over-limit indicator. |
| 4 | `ui-polish/69/narrow-375-overflow.png` | 375px forced container width | Sidebar stays at fixed 240px; main content compresses. `document.body.scrollWidth` measured 681px on a forced-375 viewport — horizontal scroll would bite a real phone. |
| 5 | `ui-polish/69/desktop-save-toast.png` | 1920×893 | Save-confirmation path; toast text verified via `evaluate` as `"Saved. Future messages will use "Shri Krishna Bhavan"."` (toast auto-dismisses at 3s; the screenshot is post-dismiss, which is the more likely user state anyway). |

## Findings

### Pass — Interaction wiring

- `#senderName` input → all three preview targets (`previewName1` SMS bubble 1, `previewName2` SMS bubble 2, `previewName3` IVR greeting). Verified via `browser_evaluate` that changing the input and dispatching `input` propagates to all three in a single frame.
- `#saveBtn` shows the confirmation toast with the current sender name interpolated. Auto-dismisses after 3 seconds. Works as designed.
- Empty / whitespace input correctly falls back to `"OSH"` in every preview — mirrors the server-side behavior of `applySenderPrefix` with the `SMS_SENDER_FALLBACK_NAME` constant.

### Pass — Layout at desktop ≥ 1024px

- No clipping, overlap, or unintended horizontal scroll at the default Playwright viewport (1920×893) or at a measured 1280×900 equivalent (via `getBoundingClientRect` on key elements).
- Typography hierarchy is consistent: `h1` 24px, `.card h2` 17px, body 15px, hints 12–13px. Matches the existing SKB admin surface convention.
- Color palette stays within the neutral-blue baseline used elsewhere in the admin: `#1d4ed8` primary action, `#2563eb` mock-banner, `#111` / `#374151` / `#6b7280` text steps, neutral grays for backgrounds.
- Read-only sending-number card "Shared" pill and Voice & IVR "Active" pill both render with intended shape (rounded full, small padding) and readable contrast.

### Pass — Console and network health

- One 404 for `favicon.ico` — benign, not shipped with the mock.
- No JS errors, no unresolved promises, no layout shifts observed.

### Defect — P1 — Mock has no responsive design

**Evidence:** `ui-polish/69/narrow-375-overflow.png` + measured `body.scrollWidth = 681px` at 375px forced container width.

At narrow viewports (mobile, small tablet) the layout is a fixed `grid-template-columns: 240px 1fr` with no `@media` breakpoints. The sidebar stays 240px wide regardless of viewport width, forcing the main card below its minimum-readable width and triggering horizontal scroll. A real phone browsing the admin would need to pan side-to-side.

**Expected:** At ≤ 768px, sidebar collapses to a hamburger/drawer or to a top row of horizontal tabs; main content takes full width. Primary forms remain usable with a single thumb.

**Repro:** Load `69-admin-sms-settings.html` in a browser at 375×812. Observe horizontal scrollbar on `<body>` and that the Display name card is < 300px wide.

**Recommendation:** When wiring the real admin, add `@media (max-width: 768px)` rules collapsing the sidebar to a drawer (matching the existing admin surface conventions landed in #46/#51 — this isn't a new pattern to invent). **Not a blocker for this PR** because (a) the real admin wiring is deferred, (b) restaurant staff mostly use this surface on a laptop, not a phone. File as a follow-up issue when wiring lands.

### Defect — P2 — Counter shows no over-limit state when value is programmatically set > 30

**Evidence:** `ui-polish/69/desktop-overflow-count.png`.

The `maxlength="30"` attribute only prevents keystrokes past 30 characters; it does not guard against programmatic assignment (e.g., during form hydration from server state that accidentally carries a longer value, or during an API-response round-trip). When this happens:

- Counter reads `49 / 30` with no color change, no error affordance.
- The preview bubbles silently render the over-limit value — wrapping it across multiple lines.
- The Save button is still enabled and will accept the value.

**Expected:** Counter turns red (or shows an `over-limit` badge) when `input.value.length > 30`. Save button disables or shows an inline validation error until the field is back within bounds.

**Recommendation:** Add a trivial over-limit class toggle in the existing `sync()` function (`count.classList.toggle('over-limit', input.value.length > 30)` plus CSS). **Not a blocker for this PR** because the server-side path applies the truncation on save (spec R8), so even a bad hydration won't produce long outbound prefixes. File as a follow-up.

### Observation — Wide viewport looks underused

At 1920×893 the main content max-width is 860px, so ~60% of the viewport is empty light-gray. Matches the existing SKB admin behavior and isn't a defect — just a note that the admin surface is centered within a max-width container. No action needed.

### Observation — Mock-banner blue bar consumes ~40px at top

The blue "Mock — Admin SMS Settings (Issue #69)" banner is a mock artifact only. Real admin will not include it. No action needed; called out only so the real-admin wiring PR doesn't accidentally copy it.

## Accessibility quick pass

- All form controls have visible labels and hint text.
- Color contrast on primary text / backgrounds is well above 4.5:1.
- Interactive affordances (button focus, input focus) inherit from the browser default + the `:focus` ring on the `input[type="text"]`.
- One gap: the live preview header uses small-caps text at 11px (`PREVIEW — WHAT YOUR GUESTS WILL SEE`) which is readable but below typical body-copy size; not a WCAG fail but borderline. Acceptable for a preview heading; would not change in real admin.

No `aria-live` region on the toast; screen-reader users might miss the save confirmation. Not a blocker — document for the real-admin wiring PR to add `role="status" aria-live="polite"` on the `.toast` element.

## Signoff — retracted

The prior "no P0 defects" signoff is **retracted**. Mock-level sanity review was passed (layout / interaction / console), but that is not what a UI polish signoff is supposed to attest to. No feature-level polish has been verified. A proper signoff will follow a run against the real wired admin surface once that's implemented.
