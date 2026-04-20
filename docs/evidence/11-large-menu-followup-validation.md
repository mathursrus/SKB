# Issue 11 follow-up validation

Date: 2026-04-20

## Scope

- Fix guest `Add to cart` reliability in `public/queue.js`
- Validate large-menu navigation in guest ordering and public menu views

## Code fix

- Introduced `loadStatusWithRetry(...)` in `public/queue.js`
- Treat `429` from `/api/queue/status` as an explicit retry signal
- Restored seated-state handling to a normal successful status load
- Used the retrying status loader after join and after place-order
- Stopped the poller from treating retry signals as "left the queue"

## Automated validation

- `npm run typecheck`
- `npm run build`
- `npx tsx tests/integration/menu-render.integration.test.ts`
- `npx tsx tests/integration/guest-ordering.integration.test.ts`
- `npx tsx tests/ui/guest-ordering.ui.test.ts`

All passed.

## Live validation

Environment:

- `http://localhost:15420/r/ui-validation-cafe`
- Mobile viewport validation via `playwright-core` against local Edge

Observed results:

- Guest queue flow joined successfully with a fresh test diner
- Order tab exposed section jump navigation for the seeded large menu
- Guest order view rendered `8` section links
- First item accepted quantity, optional ingredient selection, and notes
- Clicking `Add to cart` updated the cart to `2 items`
- Inline status confirmed `Added to cart`
- Public `/menu` rendered `8` section navigation links

Additional follow-up:

- Reworked the guest order layout so the cart renders before the long menu and stays sticky near the top of the viewport
- Added a dedicated `Cart` jump chip to the section nav
- Live mobile check confirmed the cart stayed visible near the top after add-to-cart:
  - cart box `y=8`
  - viewport height `915`
  - cart count updated to `1 item`
- Removed the explicit `Save draft` action from the guest UI
- Guest cart changes now auto-save to the draft endpoint
- Live mobile poll-survival check confirmed the cart no longer disappears on the 10s status refresh:
  - cart count after poll: `1 item`
  - saved notes still present: `No onion`

## Screenshots

- `docs/evidence/11-guest-order-large-menu-mobile.png`
- `docs/evidence/11-public-menu-large-menu-mobile.png`
- `docs/evidence/11-guest-order-cart-visible-mobile.png`
- `docs/evidence/11-guest-order-autosave-survives-poll-mobile.png`
