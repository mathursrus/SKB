# App Store Connect — Metadata Draft

Target app: **OSH**
Bundle ID: `com.skbwaitlist.hoststand`
Primary category: **Business**
Secondary category: **Food & Drink**
Age rating: **4+**
Content descriptors: **None**
Distribution: **Public** (App Store, worldwide). OSH is publicly downloadable. Staff sign in with their issued OSH account; guests enter a restaurant slug to open the branded queue tracker for the restaurant they are visiting.

## Listing copy

### App name (30 chars)
```
OSH
```

### Subtitle (30 chars)
```
Restaurant OS
```

### Promotional text (170 chars)
```
Run your restaurant from one app: host queue, admin controls, and a branded guest waitlist experience.
```

### Description (4000 chars)
```
OSH is the restaurant operating system for the front desk. Staff sign in with their OSH account and land in the right workspace for their role: host, admin, or owner. Guests can open the same app into a branded queue tracker for the specific restaurant they are visiting.

WAITING TAB
• Live queue: every party in position order, with promised time and a second-by-second "waiting" clock.
• One-tap Seat: tap Seat on any party, enter the physical table number, and confirm. The party moves to the Seated tab and your turn-time tracking starts.
• One-tap Chat: a two-way SMS thread with the guest, including three quick replies — "Your table is almost ready," "Need 5 more minutes?" and "We lost you — are you still here?"
• One-tap Call: dial the guest's phone directly from the row. No paste, no dialer. The call is logged on the party record.
• Notify, Custom SMS, Custom Call, No-show: the existing host actions are preserved.
• Rows whose phone number is missing or invalid disable messaging and calling automatically so you can't accidentally reach the wrong party.

SEATED TAB
• Every seated row shows its table number in the leftmost cell so anyone at the stand can answer "where is the Patel party sitting?" in half a second.
• Advance turn states — Ordered / Served / Checkout / Departed — so your downstream Avg Order, Avg Serve, and Avg Checkout rollups stay accurate.

SEAT-WITH-TABLE DIALOG
• Table number is required on seat. Recent tables are quick-pick chips.
• If you try to seat a party at a table that is already occupied, you see the conflict (which party is currently there), and an explicit override is required to proceed. Mistakes are caught; emergencies are not blocked.

ROLE-AWARE ACCESS
• Hosts land directly in the live floor view.
• Admins and owners get a workspace for guest settings, messaging identity, and front-desk controls.
• Guests can enter a restaurant slug and optionally a party code to open that restaurant's branded queue tracker.

BUILT FOR THE STAND
• Rich mobile-first UI with restaurant branding after login.
• iPad-primary, iPhone-secondary.
• Polls every 15 seconds while the app is in the foreground; pauses automatically while backgrounded so it doesn't burn battery on a locked tablet.
• Staff sign in with a named OSH account, with multi-restaurant selection when needed.

OSH is an internal hospitality tool. It does not collect or display data beyond what the restaurant already manages in the OSH dashboard today.
```

### Keywords (100 chars, comma-separated, no spaces)
```
waitlist,restaurant,host,queue,hospitality,admin,guest,seating,osh,diner
```

### Support URL
```
https://osh.wellnessatwork.me
```

### Marketing URL
```
https://osh.wellnessatwork.me
```

### Copyright
```
© 2026 OSH
```

## Version info

| Field | Value |
|---|---|
| Version | 1.0.0 |
| Build | 7 (auto-increment via EAS production profile) |
| What's new in this version | First public release. Includes: role-aware login (host / admin / owner / guest); host floor view with live queue, seat-with-table capture, two-way SMS chat, one-tap call; admin workspace (charts, staff, menu, hours, website settings, integrations); guest queue tracker by restaurant slug; OTA updates applied on startup. |

## App Privacy (App Store Connect "Data Types" section)

Per `docs/COMPLIANCE.md` §1, the answer to "Do you or your third-party partners collect data from this app?" is **No**. The app reads guest data from the OSH backend for display but does not persist or transmit it elsewhere, and the only data stored on-device is the host session cookie (in Keychain), which is not user-scoped identity data.

Select in App Store Connect:
- **Data Not Collected** → Yes

If a future Sentry integration (Phase 11) starts collecting crash data: change this to declare "Diagnostics · Crash Data" with the appropriate purposes ("App Functionality") and link-to-user setting ("Not Linked to You"), and add Sentry to the Data Types form.

## Screenshots required

iPad Pro (12.9-inch, 6th generation) 2048×2732 — minimum 3, max 10:

1. Waiting tab with 6+ parties. Live waiting clocks visible. The full row action cluster on the middle row should be in frame. Caption: "Every party, every clock."
2. Seat dialog open with "12" entered and the conflict alert visible (Kim, Jae occupying). Caption: "Catch table conflicts before you make them."
3. Seat dialog with a valid empty table and recent-table chips visible. Caption: "Seat with one number."
4. Chat slide-over open on a party with 2+ inbound messages, quick-reply chips visible. Caption: "Answer waiting guests in one tap."
5. Seated tab with 4+ parties, table numbers visible as the leftmost cell. Caption: "Know who's at which table."

iPhone 6.7" (iPhone 15 Pro Max) 1290×2796 — minimum 3, max 10:

Same screens in portrait orientation. iPhone is secondary but required by App Store for universal apps.

## App Preview video (optional)

A 15-30s screen recording walking through: login → Waiting tab → tap Seat on row 3 → enter 14 → confirm → party jumps to Seated tab at table 14. Optional but improves conversion.

## Review notes for App Review (private)

These are the demo credentials and reviewer narrative pasted into App Store Connect → App Review Information. The account and seeded queue are live on the prod backend; reviewer can sign in immediately.

```
OSH is a restaurant operations app. Staff sign in with email + password to manage the host floor and admin workspace; guests enter a restaurant slug (no account needed) to open a public queue tracker.

DEMO ACCOUNT (also in the Sign-In Information fields above):
  Email:    apple-demo-owner@osh.app
  Password: AppleDemoOwner!2026
This account is owner-role at location `apple-demo` on our production backend (https://osh.wellnessatwork.me). Owner role has access to every part of the app.

WHAT TO DO IN THE APP:
1. On the login screen, make sure the "Staff" tab is selected (top of the card).
2. Enter the demo email + password and tap Sign in.
3. You'll land in the host workspace. Tap any party's amber "Seat" button to see the Seat-with-table dialog. Tap a "Chat" badge on a row to see the SMS slide-over. The "Call" button opens the iOS dialer pre-filled with a test number.
4. The Workspace and Settings tabs at the bottom switch into the admin views (charts, staff management, hours, website settings, integrations).

GUEST EXPERIENCE (no account needed): on the login screen, switch to the "Guest" tab, enter slug `apple-demo`, and tap Continue.

The app does not collect any data from the reviewer. Guest names and phone numbers shown in the staff view are pre-populated test parties on the demo location.

Contact: sid.mathur@gmail.com
```
