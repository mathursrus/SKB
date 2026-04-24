# QR Wrong Site - Standing Work List

## Scope

- Issue type: `bug`
- Goal: ensure the door QR resolves to the correct per-restaurant public site instead of defaulting to the wrong host/base URL.
- Non-goals:
  - no redesign of visit routing modes
  - no schema changes
  - no QR visual redesign

## Pattern Discovery

- Door QR SVG is generated in `src/routes/host.ts` at `GET /host/visit-qr.svg`.
- Public visit routing is served at `GET /r/:loc/visit` in `src/mcp-server.ts`.
- Current QR generation prefers `Location.publicHost`, otherwise the admin request host, and ignores `Location.publicUrl`.
- The codebase already has a canonical URL precedence pattern in `src/services/queueStatusUrl.ts`:
  - `Location.publicUrl`
  - app/base URL fallback
  - request host fallback
- Admin QR preview text is rendered in `public/admin.js` and is expected to match server-side QR generation logic.

## Implementation Checklist

- [ ] `src/services/visitQrUrl.ts` - add shared resolution logic for the QR destination URL.
- [ ] `src/routes/host.ts` - switch QR SVG generation to the shared visit URL resolver.
- [ ] `public/admin.js` - switch the displayed scanner destination to the shared URL shape assumptions.
- [ ] `tests/unit/visitQrUrl.test.ts` - cover precedence and final URL path generation.
- [ ] `tests/unit/bug50Regression.test.ts` or another targeted unit test - keep admin QR UI expectations aligned if needed.

## Validation Requirements

- `uiValidationRequired`: false
- `mobileValidationRequired`: false
- Required automated checks:
  - targeted unit tests for QR URL resolution
  - TypeScript compile check
- Required manual validation:
  - verify generated QR destination for a location with `publicUrl`
  - verify fallback destination when only request host is available

## Notes

- Favor a pure helper so route logic and admin preview logic cannot drift again.
- Preserve tenant scoping by always generating a per-location `/r/:loc/visit` URL.
