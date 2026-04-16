# App Store Connect — Metadata Draft

Target app: **SKB Host Stand**
Bundle ID: `com.skbwaitlist.hoststand`
Primary category: **Business**
Secondary category: **Food & Drink**
Age rating: **4+**
Content descriptors: **None**
Distribution: **Private** (Apple Business Manager / internal TestFlight). SKB Host Stand is an operations tool for restaurant staff and is not intended for general App Store discovery. If public listing is preferred, remove this paragraph and set "Distribution: Public."

## Listing copy

### App name (30 chars)
```
SKB Host Stand
```

### Subtitle (30 chars)
```
Waitlist for restaurant hosts
```

### Promotional text (170 chars)
```
Manage your live waitlist from the host stand. Seat with table numbers, chat with waiting guests, and keep turn-time tracking tied to every party.
```

### Description (4000 chars)
```
SKB Host Stand is the staff-side companion to the SKB (Shri Krishna Bhavan) walk-in waitlist system. It is the tool your host uses at the stand to run the dinner rush: see who is waiting, chat with them, seat them at a specific table, and keep your turn-time analytics honest.

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

BUILT FOR THE STAND
• Dark theme, tabular-nums for every time and position column so numbers don't jiggle.
• iPad-primary, iPhone-secondary.
• Polls every 15 seconds while the app is in the foreground; pauses automatically while backgrounded so it doesn't burn battery on a locked tablet.
• Host sign-in via your existing SKB location PIN. Sessions persist in the iOS Keychain.

SKB Host Stand is an internal operations tool for restaurant staff. It does not collect or display data beyond what your host already sees on the SKB dashboard today.
```

### Keywords (100 chars, comma-separated, no spaces)
```
waitlist,restaurant,host,queue,seating,hostess,tablehostess,hospitality,skb,diner
```

### Support URL
```
https://skb-waitlist.azurewebsites.net
```

### Marketing URL
```
https://skb-waitlist.azurewebsites.net
```

### Copyright
```
© 2026 Shri Krishna Bhavan
```

## Version info

| Field | Value |
|---|---|
| Version | 0.1.0 |
| Build | 1 (auto-increment via EAS production profile) |
| What's new in this version | Initial TestFlight build. Implements Issue #30 — waitlist transparency, host chat/call, seat-with-table capture. |

## App Privacy (App Store Connect "Data Types" section)

Per `docs/COMPLIANCE.md` §1, the answer to "Do you or your third-party partners collect data from this app?" is **No**. The app reads guest data from the SKB backend for display but does not persist or transmit it elsewhere, and the only data stored on-device is the host session cookie (in Keychain), which is not user-scoped identity data.

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

```
SKB Host Stand is an internal staff tool for a restaurant waitlist system. To test the app, reviewers can sign in with the demo PIN 1234 against the staging backend at https://skb-waitlist-staging.azurewebsites.net. The app does not collect any data from the reviewer. It displays guest names and phone numbers which are pre-populated test data on the staging backend.

Issue #30 (this submission) adds: (1) the Seat-with-table dialog you'll see when tapping the amber "Seat" button on a row; (2) the Chat slide-over you'll see when tapping the "Chat" button with an unread-message badge; (3) the "Call" button which opens the device dialer with a test number.

Contact: sid.mathur@gmail.com
```
