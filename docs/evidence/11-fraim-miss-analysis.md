# Issue #11 FRAIM Miss Analysis

Date: 2026-04-20

## Failure Statement

I declared the earlier UI-polish pass clean even though the guest experience still mixed waitlist and ordering into one cluttered mobile flow, and the new menu-ordering controls introduced layout drift in the guest and admin surfaces.

## Impact

- User impact: the main mobile guest journey was harder to use at the exact point where the feature was supposed to reduce friction while waiting.
- Operational impact: the host/guest order flow technically worked, but the guest ordering surface was not presentation-ready.
- Severity: medium. The feature was functional, but the UX regression was visible in the core customer-facing path.

## Expected Behavior Missed

- Waitlist and ordering should have been clearly separated in the guest UI once ordering was added.
- New order controls should have respected existing button, spacing, and alignment rules on both mobile guest pages and the admin menu builder.
- The UI-polish validation should have caught those defects before I reported the work as done.

## What Went Wrong

1. I treated the successful happy-path interaction as sufficient evidence for UX quality.
2. I looked at screenshots, but I did not review them against the product mental model the user actually wanted.
3. I let the existing validation artifact say "none found" even though the guest mobile screenshot visibly showed stacked waitlist and ordering content in one long page.
4. I added new UI primitives without tightening the inherited CSS rules enough, especially around action buttons and the order-card label styles.
5. During the follow-up validation I also discovered a stale long-running dev server on port `15420`, which means one manual pass was initially checking the old frontend bundle instead of the current one.

## Why It Went Wrong

1. I optimized for feature completeness and endpoint correctness more than for interaction clarity.
2. I relied too heavily on automated tests and DOM-contract checks, which proved the flow existed but did not prove the flow was clean.
3. I did not force a breakpoint-by-breakpoint review checklist from the `ui-polish-validation` job before signoff.
4. I failed to challenge CSS inheritance from broad rules like full-width primary buttons and generic card labels after inserting the new ordering surface.
5. I did not verify that the manual validation server had been restarted after frontend edits, so one pass started from invalid evidence.

## What Should Have Been Done Instead

1. After the first implementation pass, I should have explicitly asked: "Is waitlist status still the primary mobile view, and does ordering read like a separate task?"
2. I should have required a guest mobile screenshot for both states:
   - joined + waiting
   - joined + ordering
3. I should have reviewed the screenshots specifically for:
   - stacked-flow clutter
   - button width inheritance
   - label casing and spacing drift
   - misaligned admin item actions
4. I should have restarted or freshly launched the validation server before trusting any browser evidence after frontend changes.

## How To Prevent Similar Failures

1. For any guest-facing feature that adds a second major task, require explicit IA validation:
   - primary task
   - secondary task
   - transition between them
2. For future UI-polish work, use a fixed checklist before signoff:
   - mobile first screen
   - mobile secondary state
   - action row alignment
   - inherited button behavior
   - empty, draft, and locked states
3. After CSS-heavy changes, inspect the actual rendered controls for inherited global styles instead of trusting component-local rules.
4. Treat local server freshness as part of the validation checklist: restart or confirm bundle timestamp before manual UI review.
5. Do not mark a UI-polish pass complete if the screenshots still require explanation or rationalization.

## Ownership

This miss was mine. The defects were visible in the product surface and should have been caught before I reported the UI-polish job as complete.
