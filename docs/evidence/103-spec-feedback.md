# Feedback for Issue #103 — feature-specification Workflow

## Round 1 Feedback
*Received: 2026-04-28 from @mathursrus on PR #104 (approval with conditions)*

### Comment 1 — ADDRESSED

- **Author**: @mathursrus
- **Type**: pr_comment (verbal approval message)
- **Comment**: "approved PR, but make sure you don't lose the full list view once the user is added to waitlist"
- **Root cause**: Earlier `103-queue-mobile.html` post-join state showed only the position card and dropped the `#public-list-card` (R3 from issue #37 — full waitlist with redacted names). That public-list view is an existing shipped feature; trimming it would have been a regression.
- **How addressed**:
  - Added new requirement **R11**: post-join the public-list view stays visible without scroll past the position card; the position card is sized so the first public-list row is in-viewport on 375 × 667.
  - Added **AC-R11** with a Given/When/Then assertion.
  - Added Validation Plan **§2b** asserting both `#conf-card` and the first public-list row are within `window.innerHeight`.
  - Updated mock `103-queue-mobile.html` post-join view: compact position card (44 px digit instead of 56 px, 16 px padding instead of 22 px) followed by the full `Who's in line` card with the diner's own row highlighted in gold.
  - Added UX (A) step 7 calling out that the chat card and "called" callout / "I'm on my way" ack are also preserved.
  - Updated R-tag traceability table.
- **Status**: ADDRESSED

### Comment 2 — ADDRESSED

- **Author**: @mathursrus
- **Type**: pr_comment (verbal approval message, same line)
- **Comment**: "and the richeness of the other [actions] tha[t] hosts can take"
- **Root cause**: Earlier `103-host-mobile.html` showed only 4 row actions (Call, Seat, Chat, No-show) and dropped Sentiment select, Notify/Re-notify, Custom SMS (✉ compose modal), Custom Call (☎ confirm-then-dial), and the "called" / "on-way" / unread / sentiment badges. The Seated tab card dropped the 7 transition-duration columns (Waited / To Order / To Serve / To Checkout / In State / Total at table) and kept only the next-state button. Both would have been feature regressions vs. the desktop table — exactly what the host operator's feedback was *not* asking for.
- **How addressed**:
  - Added new requirement **R12** mandating full feature parity between the mobile card layout and the desktop table — every action, every badge, every transition-duration metric, the full state-advance ladder, and the tap-to-expand timeline are all preserved.
  - Added **AC-R12** with explicit DOM-selector assertions (`[data-action="sentiment"]`, `[data-action="notify"]`, `[data-action="custom-sms"]`, `[data-action="custom-call"]`, etc.) traceable directly to `host.js:144-156` and `host.js:209-217`.
  - Added Validation Plan **§2a** action-set parity audit that renders both 375 px and 1280 px and asserts the same actions are present in both DOMs.
  - Updated UX (B) step 2 with explicit per-tab bullets enumerating every Waiting / Seated / Complete action that must persist on the mobile card.
  - Rewrote `103-host-mobile.html` Waiting card: 3-row action layout — primary (Seat + Notify) / secondary 4-up icons (Call · Chat with unread dot · Custom SMS · Custom Call) / tertiary (Sentiment select + No-show). All ≥ 44 × 44 px. All status badges (CALLED, ON WAY, sentiment dot, unread chat count) rendered inline.
  - Rewrote `103-host-mobile.html` Seated card: 4-up "transition pills" row (Waited / To Order / To Serve / Dining) where filled pills are gold and empty are muted, state badge with In State timer, total-at-table pill, primary state-advance button + Departed shortcut + sentiment select, plus tap-to-expand timeline toggle.
  - Updated R-tag traceability table.
- **Status**: ADDRESSED

## Round 1 Summary

- 2 PR comments received, 2 ADDRESSED.
- New requirements added: **R11** (post-join public list visibility), **R12** (host feature parity).
- New ACs: **AC-R11**, **AC-R12**.
- New Validation Plan items: **§2a** (action-set parity audit), **§2b** (post-join public-list visibility).
- Both mocks rewritten end-to-end (v2 banners added inside each file's header comment).
- Spec doc updated with traceability rows for R11 + R12.
- All changes committed to branch `spec/103-mobile-usability` and pushed to PR #104.
