# Issue 82 - UI Polish Validation

Date: 2026-04-24
Validator: Codex via Playwright MCP
Validation target: `http://localhost:15582/r/issue-82-demo/`

## Scope

Validated the new guest menu-browsing capability and the existing seated-only ordering behavior after separating `menu` from `order` in guest feature controls.

## Environment

- Local server: `http://localhost:15582`
- Tenant: `issue-82-demo`
- Browser automation: Playwright MCP browser session
- Responsive/mobile check:
  - phone-width viewport: `390x844`
  - tablet-width viewport: `768x1024`

## Important Limitation

The available Playwright MCP tooling in this session exposed viewport resizing, but not a named device-profile/emulator switch. The mobile checks below are therefore **browser-level responsive validations at mobile-width viewport sizes**, not a full device-profile emulator run. This is the strongest honest evidence available in the current tool surface.

## Scenario 1 - Admin can configure browse-only guest mode

Steps:

1. Signed into `admin.html` as owner for `issue-82-demo`.
2. Opened `Front desk` -> `Guest Experience`.
3. Set:
   - `Menu browsing = On`
   - `Ordering = Off`
4. Clicked `Save Guest Experience`.

Result: **Pass**

- Save confirmation rendered as `Saved ✓`.
- The new `Menu browsing` control is present and usable.
- Screenshot: `docs/evidence/ui-polish/82/admin-guest-experience-browse-only.png`

## Scenario 2 - Guest can browse menu while ordering is off

Viewport: `390x844`

Steps:

1. Joined the queue on `queue.html`.
2. Opened the guest secondary tab after the browse-only config was saved.

Result: **Pass**

- Secondary tab label changed to `Menu`.
- Menu card rendered with the published dish (`Masala Dosa`).
- No add-to-cart buttons were present.
- Cart section was hidden.
- Lock copy explained that ordering from the waitlist page is turned off.
- Screenshot: `docs/evidence/ui-polish/82/guest-menu-browse-only-mobile.png`

## Scenario 3 - Ordering on restores cart controls but remains seated-gated

Viewport: `390x844`

Setup change:

- Switched guest features to:
  - `Menu browsing = On`
  - `Ordering = On`
  - `Chat = Off`
  - `SMS = Off`

Steps:

1. Reloaded the guest queue page for the active party while still waiting.
2. Opened the secondary tab.

Result: **Pass**

- Secondary tab label changed back to `Order`.
- Add-to-cart controls were present.
- Cart section was visible.
- `Place order` remained disabled while the party was not seated.
- Lock copy stated that final place-order unlocks after seating.

## Scenario 4 - After seating, adding an item enables place-order

Viewport: `390x844`

Steps:

1. Seated the active party via host API (`tableNumber = 12`).
2. Reloaded the guest queue page with the same party code.
3. Opened the `Order` tab.
4. Added `Masala Dosa` to the cart.

Result: **Pass**

- Status card updated to `Table 12`.
- Order card copy changed to `Your table is ready. Review and place your order when you are ready.`
- Cart count updated to `1 item`.
- `Place order` became enabled after an item was in the cart.
- Screenshot: `docs/evidence/ui-polish/82/guest-order-seated-mobile.png`

## Scenario 5 - Tablet-width responsive check

Viewport: `768x1024`

Result: **Pass**

- No horizontal overflow detected.
- Measured values:
  - `viewportWidth = 768`
  - `scrollWidth = 753`
  - `horizontalScroll = false`
- Cart and item editor remained visible and usable.
- Screenshot: `docs/evidence/ui-polish/82/guest-order-seated-tablet.png`

## Console / Runtime Notes

- After the final validation state (ordering on, chat off), the current page had **no new console errors**.
- Earlier console errors seen during exploratory setup were investigated:
  - `401 /api/me` and `401 /api/host/stats` came from the pre-login admin page before authentication.
  - `429` / `403` chat endpoint errors occurred only while chat polling was enabled during an exploratory pass; they disappeared once chat was disabled for the final ordering validation.

## Verdict

**Validated pass** for issue 82's user-facing behavior:

- owners can independently enable guest menu browsing
- menu remains browsable when ordering is disabled
- ordering-enabled mode still enforces seated-only placement
- mobile-width and tablet-width layouts remain usable for the guest flow
