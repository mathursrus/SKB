# Feedback for Issue #29 - Spec Workflow

## Round 1 Feedback
*Received: 2026-04-09T00:49:05Z*

### Comment 1 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: docs/feature-specs/29-sms-users-when-host-calls-them.md
- **Line**: 28
- **Comment**: "no longer option phone number right?"
- **Status**: ADDRESSED
- **Resolution**: Changed phone number from optional to required in spec (R1), UX flow, mock, and edge cases.

### Comment 2 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: docs/feature-specs/29-sms-users-when-host-calls-them.md
- **Line**: 32
- **Comment**: "System should send an SMS with a link to where they can monitor their place in line"
- **Status**: ADDRESSED
- **Resolution**: Added new requirement R3 for confirmation SMS on join with status page link. Added "Diner Flow (Confirmation SMS on Join)" section. Updated SMS preview mock with join confirmation message.

### Comment 3 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: docs/feature-specs/29-sms-users-when-host-calls-them.md
- **Line**: 38
- **Comment**: "required"
- **Status**: ADDRESSED
- **Resolution**: Same as Comment 1 — phone number is now required. Updated R1 acceptance criteria to block form submission when phone is empty.

### Comment 4 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: docs/feature-specs/29-sms-users-when-host-calls-them.md
- **Line**: 40
- **Comment**: "make this a bit more polite. this sounds like youre scoding"
- **Status**: ADDRESSED
- **Resolution**: Changed repeat call SMS from "You've been called {N} times. Please come to the front now." to "Just a friendly reminder — we've called your name {N} times. Your table is waiting for you!" Added R6 for polite tone requirement. Updated SMS preview mock.

### Comment 5 - ADDRESSED
- **Author**: mathursrus
- **Type**: review_comment
- **File**: docs/feature-specs/29-sms-users-when-host-calls-them.md
- **Line**: 42
- **Comment**: "host should be able to see a checkmark next to the call label if SMS was correctly sent... X if not."
- **Status**: ADDRESSED
- **Resolution**: Updated host flow step 4 to show checkmark/X icons. Added requirement R10 for SMS delivery status indicator on host dashboard.
