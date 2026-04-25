# UI Polish Validation - Issue #81

## Scope

Host waiting-row SMS eligibility cues for issue `#81`.

## Scenarios

1. Desktop host view with one opted-in party and one web-only party.
2. Open chat drawer for the web-only party and verify explanatory messaging.
3. Narrow browser width (`390x844`) to confirm the chat drawer remains usable.

## Results

- Desktop:
  - `Opt In Guest`: `Notify`, `Chat`, and `Custom SMS` remained enabled.
  - `Web Only Guest`: `Notify` and `Custom SMS` rendered disabled.
  - `Web Only Guest` `Chat` remained enabled and exposed `web only` explanatory copy.
- Drawer:
  - Title matched the selected party.
  - Mode banner rendered: `SMS unavailable — this thread is web only because the diner did not opt into SMS updates.`
  - Quick replies and composer remained available.
- Narrow width:
  - chat drawer stayed open
  - drawer width matched viewport width
  - composer and send button remained visible

## Artifacts

- `docs/evidence/ui-polish/81/host-web-only-chat-desktop.png`
- `docs/evidence/ui-polish/81/host-web-only-chat-mobile.png`
