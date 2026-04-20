# Issue #11 UI Validation

Date: 2026-04-20  
Environment: local app server on `http://localhost:15420`  
Browser: Microsoft Edge via `playwright-core`  
Viewport targets:

- guest mobile: `375x812`
- admin desktop: `1280x900`
- host desktop: `1280x900`

## Automated Verification

- `npm run typecheck`
- `npm run build`
- `npx tsx tests/unit/menuValidation.test.ts`
- `npx tsx tests/unit/siteRenderer.test.ts`
- `npx tsx tests/integration/menu-render.integration.test.ts`
- `npx tsx tests/integration/guest-ordering.integration.test.ts`
- `npx tsx tests/ui/menu-builder.ui.test.ts`
- `npx tsx tests/ui/guest-ordering.ui.test.ts`

All passed on this validation round.

## Manual Validation Round 2

1. Admin rich menu builder: pass
   - Signed in as the restaurant owner.
   - Opened the `Menu` tab.
   - Verified the rich item row now keeps the photo, item name, price, availability, required ingredients, optional add-ons, and remove action aligned in one consistent block.
   - Screenshot: `docs/evidence/11-admin-rich-menu-builder-round2.png`

2. Guest waitlist and ordering split into tabs: pass
   - Opened the guest page on mobile for an already-joined party.
   - Confirmed the waitlist view is the default tab and no longer mixes the full ordering UI into the same scrolling surface.
   - Confirmed the `Order` tab is available only once the party has joined the line.
   - Screenshot: `docs/evidence/11-guest-waitlist-tab-mobile-round2.png`

3. Guest draft ordering on mobile: pass
   - Switched to the `Order` tab.
   - Selected an optional add-on, changed quantity to `2`, added notes, and saved the draft.
   - Confirmed the cart, actions, and controls stay aligned on the mobile layout.
   - Screenshot: `docs/evidence/11-guest-order-tab-mobile-round2.png`

4. Guest seated-only placement still works: pass
   - Seated the same party from the host view.
   - Reloaded the guest page and confirmed the `Order` tab now shows the seated state message and an enabled `Place order` button.
   - Screenshot: `docs/evidence/11-guest-order-seated-mobile-round2.png`

5. Host seated-party order detail: pass
   - After the guest placed the order, opened the host `Seated` tab.
   - Expanded the party row.
   - Confirmed the detail panel shows the placed order, quantity, selected option, notes, and timestamp.
   - Screenshot: `docs/evidence/11-host-order-detail-desktop-round2.png`

## Layout Notes

- The guest page now separates waitlist/status from ordering with a dedicated tab strip, which removes the earlier stacked-card clutter on mobile.
- The order action row no longer inherits full-width primary-button behavior, so `Save draft` and `Place order` sit in a stable inline layout.
- The admin menu builder no longer has the trailing delete action floating off-axis from the rest of the item controls.

## Issues Found

- One local validation attempt initially hit a stale long-running dev server on port `15420`, which was still serving the previous frontend bundle. The server was restarted before the final manual pass.
- Repeated ad hoc queue joins on the shared validation tenant triggered the queue rate limiter. Final screenshots reused a known active guest code and host interactions on the refreshed server.
