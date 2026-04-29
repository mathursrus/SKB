---
author: sid.mathur@gmail.com
date: 2026-04-28
context: issue-103 / feature-specification job
---

# Coaching Moment: feature-parity-when-redesigning-existing-surface

## What happened

While drafting the mobile-first feature spec for issue #103, the agent produced two HTML mocks (diner waitlist + host stand) that solved the stated mobile-fit problem by quietly removing existing features. The diner post-join mock dropped the `#public-list-card` (R3 from issue #37 — full waitlist with redacted names). The host Waiting-tab card collapsed the 8 row actions in `host.js:144-156` (Sentiment, Seat, Notify, Chat, Call, Custom SMS, Custom Call, No-show) down to 4 (Call, Seat, Chat, No-show), and the Seated card dropped all 7 transition-duration metrics + state-advance ladder + tap-to-expand timeline. The agent did not flag any of these as a trade-off — they were presented as part of "the cleaner mobile design." Sid approved PR #104 but caught both regressions on review: "make sure you don't lose the full list view once the user is added to waitlist ... and the richness of the other actions that hosts can take." The agent had to add R11 + R12 (feature parity requirements) and rebuild both mocks in a Round-1 errata commit.

## What was learned

When redesigning an existing UI for a new constraint (here: mobile fit), the default MUST be feature-parity-first; any reduction in actions, badges, columns, or post-state surfaces is a separate user-facing decision that requires explicit owner signoff before it ships in a mock — never bundled silently into the layout change.

## What the agent should have done

1. **Inventory the existing surface before redesigning.** For each surface in scope, enumerate every action, badge, column, and post-state card from the source files (`host.js:144-156`, `host.js:209-217`, `queue.html` post-join sections). Treat the inventory as the parity baseline.
2. **Make the layout change preserve every item in the inventory by default.** If 8 actions don't fit cleanly, find a layout shape that fits 8 (multi-row action groups, secondary icons, expand-on-tap) — don't drop to 4.
3. **If parity genuinely conflicts with the new constraint, surface the trade-off explicitly in the spec.** A bullet that says "to fit 375 px we propose dropping the on-way badge — confirm or override" is a request for signoff. A mock that silently omits the badge is a regression presented as a design.
4. **Before declaring a UI mock done, do a reverse audit:** open the existing live page in a browser, list every visible affordance, then verify each one is present in the mock. The diff between live-page and mock should be only the layout change the spec is asking for — nothing else.
