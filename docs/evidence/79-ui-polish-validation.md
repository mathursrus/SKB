# Issue 79 — UI / Manual Validation

## Scope
- Issue: `#79` — add a catering IVR entry point with an admin-configurable transfer number.
- Validation date: `2026-04-24`

## Browser Validation
- Environment: local server on `http://localhost:15520`
- Restaurant slug: `issue-79-validation`
- Auth path: real owner signup + real admin email/password login
- Validated tab: `Front desk` → `IVR / Phone Entry`

## Desktop Check
- Viewport: desktop browser
- Result: pass
- Evidence: `docs/evidence/ui-polish/79/frontdesk-desktop.png`
- Observations:
  - `Catering phone` renders inside the existing IVR card alongside `Front desk phone`.
  - Save action remains visible and aligned.
  - No overlap or clipping introduced in the front-desk card.

## Mobile / Emulator Check
- Device profile: iPhone-13-sized CDP emulation
- Emulation details: `390x844`, DPR `3`, `mobile=true`, touch emulation enabled
- Result: pass
- Evidence: `docs/evidence/ui-polish/79/frontdesk-mobile-iphone13ish.png`
- Observations:
  - The new `Catering phone` field stacks cleanly under `Front desk phone`.
  - The `Save IVR Settings` button remains visible without horizontal overflow.
  - The front-desk panel remains scrollable and usable in portrait orientation.

## Real Admin API Round-Trip
- Method: browser-session `fetch('api/host/voice-config')` after saving through the real admin page
- Result: pass
- Response:

```json
{
  "voiceEnabled": true,
  "frontDeskPhone": "2065551234",
  "cateringPhone": "4255550199",
  "voiceLargePartyThreshold": 10
}
```

## Real IVR Endpoint Check
- Environment: separate local server on `http://localhost:15521` with `TWILIO_VOICE_ENABLED=true` and `SKB_ALLOW_UNSIGNED_TWILIO=1`
- Method:
  - POST `/r/issue-79-validation/api/voice/incoming`
  - Follow returned `menu-choice` action with `Digits=5`
  - Follow redirect to `/voice/catering`
- Result: pass
- Evidence:
  - Incoming greeting advertised `press 5`
  - Catering redirect path resolved to `/r/issue-79-validation/api/voice/catering?from=2025550199`
  - Final TwiML dialed `+14255550199`

## Summary
- The admin UI exposes and persists the new catering number.
- The front-desk layout holds up on both desktop and a mobile-sized emulated profile.
- The live IVR route advertises the new option and dials the configured catering number.
