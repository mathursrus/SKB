# Feedback for Issue #45 - Feature Specification Workflow

## Round 1 Feedback
*Received: 2026-04-15T18:42 UTC via inline review comments on PR #47*

Review body: "good" (PR reviewed as `COMMENTED`, treated as approved-with-inline-answers since all 10 questions were responded to).

### Comment 1 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 287 (Q1 — Actual weekly operating hours)
- **Comment**: "correct"
- **How addressed**: My guessed default (Mon–Sun lunch 11:30 AM – 2:30 PM, dinner 5:30 PM – 9:30 PM) is confirmed. No changes required beyond the Q2 Monday closure.
- **Status**: ADDRESSED

### Comment 2 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 288 (Q2 — Open every day, or closed on a specific day?)
- **Comment**: "closed on mondays"
- **How addressed**: Updated the spec's IVR hours script, the hours table in `45-hours-location.html`, the home page Hours block in `45-home.html`, and the Q&A resolutions section to reflect "Closed Mondays. Tuesday–Sunday 11:30 AM – 2:30 PM, 5:30 PM – 9:30 PM." The IVR greeting wording shifted from "seven days a week" to "Tuesday through Sunday."
- **Status**: ADDRESSED

### Comment 3 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 289 (Q3 — Parking situation)
- **Comment**: "what you have is right"
- **How addressed**: Confirmed "complimentary parking in the lot at our building, overflow street parking on Bellevue Way SE." No changes required.
- **Status**: ADDRESSED

### Comment 4 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 290 (Q4 — Restaurant name spelling)
- **Comment**: "you got it right"
- **How addressed**: Confirmed "Shri Krishna Bhavan" is the correct spelling; current site's "Kriskhna" is a typo. No further changes required — all mocks already use the correct spelling.
- **Status**: ADDRESSED

### Comment 5 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 291 (Q5 — `frontDeskPhone` populated?)
- **Comment**: "let that be configurable in the admin section ... make sure to pull from master before starting implementation since he admin section has been refactored"
- **How addressed**: Spec updated to explicitly require that `frontDeskPhone` (used by the new press-0 IVR transfer) is admin-configurable per location via the host admin UI, not a hard-coded or DB-only value. Added an explicit implementation note: **pull from `master` before starting the feature-implementation job** because the admin section was refactored after this feature branch was cut.
- **Status**: ADDRESSED

### Comment 6 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 292 (Q6 — Google Maps embed vs. static)
- **Comment**: "embed would be good.. and allow the address to be configured by the admin"
- **How addressed**: Override accepted. Updated the hours/location mock to use a Google Maps embed iframe instead of a static map block. Added to the spec: the restaurant address (street, city, zip) becomes admin-configurable per location via the host admin UI, the same mechanism as `frontDeskPhone`. The home page footer and the IVR hours script will render from this admin-configured address, so future moves/renovations don't require code changes.
- **Status**: ADDRESSED

### Comment 7 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 293 (Q7 — Newsletter signup preserve or drop?)
- **Comment**: "drop it"
- **How addressed**: Confirmed drop. No changes required — the spec and mocks already list newsletter signup under "Non-goals".
- **Status**: ADDRESSED

### Comment 8 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 294 (Q8 — Food photos)
- **Comment**: "use whats on the site for now"
- **How addressed**: Confirmed reuse the current site's food photography (re-compressed to WebP during implementation). No changes required.
- **Status**: ADDRESSED

### Comment 9 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 295 (Q9 — DNS cutover ownership)
- **Comment**: "i will do that later"
- **How addressed**: Confirmed owner will execute the DNS cutover runbook manually after implementation lands. No changes required — runbook already lives in the spec's "Domain cutover" section.
- **Status**: ADDRESSED

### Comment 10 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: `docs/feature-specs/45-rip-and-replace-restaurant-website.md`
- **Line**: 296 (Q10 — About page copy rewrite)
- **Comment**: "you got it right"
- **How addressed**: Confirmed the warmer hospitality rewrite in `45-about.html` is approved. No changes required.
- **Status**: ADDRESSED
