# Demo Script: Onboarding a New Restaurant (ABCD)

**Audience**: A restaurant owner who has never seen the platform.
**Goal**: Take them from "I've heard about this thing" to "my waitlist is live and a guest just joined" in ~12 minutes.
**Prerequisites**: Dev server running on `localhost:3000` (or the staging URL). MongoDB up. If you've rehearsed this before, run `node scripts/demo-reset-abcd.mjs` to wipe any prior ABCD state.
**Verified**: Walked end-to-end 2026-04-18 by supervisor; bugs surfaced during the demo walk are tracked in §"Demo-driven fixes" at the end.

---

## Before the meeting

1. Open two browser windows side-by-side:
   - **Left (owner's phone)** — will be the owner's admin.
   - **Right (diner's phone)** — will be the guest joining the line.
2. Left window: navigate to `/` (marketing landing).
3. Right window: keep blank; you'll navigate later.
4. Have this script open on a third screen or print it out.
5. Reset any prior ABCD state: `node scripts/demo-reset-abcd.mjs`.

---

## Part 1 · The pitch (30 seconds)

**Surface**: `http://localhost:3000/`

> "This is the marketing page. Pretend you're a restaurant owner who just heard about us. The pitch is on screen — no app, no sales call, no POS to replace. One button: **Start free**. Let's click it."

Click **Start free**.

---

## Part 2 · Owner signup (1 minute)

**Surface**: `/signup`

Fill the form live while the owner watches. Don't narrate every field — narrate the *shape* of it.

| Field | Value |
|---|---|
| Restaurant name | **ABCD** |
| City | **Portland** |
| Your name | **Alice Brown** |
| Email | **alice@abcd-demo.test** |
| Password | **correct horse battery staple** |
| ToS | ✔ check |

Point at the **slug preview** as you type: "See `localhost/r/abcd` under the city field? That's going to be your restaurant's URL. If you want something different — `taco-abcd` or whatever — just click Change." Don't actually click Change.

Click **Create my restaurant**.

### What you show

A success card appears with:

- "Your restaurant is live."
- A **4-digit host-stand PIN** (e.g., 6867) — **read it aloud and write it on the whiteboard**. "This is the only time we show it in the clear; it's what your tablet at the door uses to log in."
- "Taking you to your admin at `/r/abcd/admin.html`..."

Auto-redirects after 2 seconds.

> **Talking point**: "What just happened behind the scenes: we created a brand new tenant in the database, provisioned your owner account, bound your user to ABCD as the owner, and set your session cookie. No one at the platform had to do anything. You're live."

---

## Part 3 · First look at the admin + the wizard (1 minute)

**Surface**: `/r/abcd/admin.html`

The onboarding wizard modal is open. Walk them through it:

1. **Restaurant basics** — address, phone, weekly hours.
2. **Pick a website template** — two designs.
3. **Add your menu** — optional, skip for now.
4. **Invite your staff** — we'll do this too.

> "This wizard is optional. If you want to put a QR on your door tonight and skip the polish, click **Dismiss for now** — you're still live. These are polish steps."

Close the modal (click ✕). Give them 10 seconds to look at the admin layout: topbar says "SKB Platform · Admin — ABCD", two tabs (**Operations** / **Staff**), empty analytics, empty dining, the QR code for the front door (visible lower on the page), IVR voice settings, Restaurant Site form, Website template picker.

---

## Part 4 · Restaurant basics (2 minutes)

Scroll down to **Restaurant Site**. Fill in:

- **Street**: 823 SW 10th Ave
- **City**: Portland
- **State**: OR
- **ZIP**: 97205
- **Public Host** (leave blank for now; mention: "If you own `abcdportland.com` we can point that at your restaurant too — just email us to set up DNS.")

**Weekly Hours**:
- **Monday**: Closed (tick the Closed box)
- **Tue–Sun**: Lunch 11:30–14:30, Dinner 17:00–22:00

Scroll up to **IVR / voice settings**. Enter Front Desk Phone: **(503) 555-0142**. Keep Large-party threshold: 8.

Click **Save Site Settings** and **Save IVR Settings**.

> **Talking point**: "Your address now shows up on your public website, your hours show up on the hours page, your phone number is what the voice IVR transfers to if a guest's party is too big to auto-queue."

---

## Part 5 · Pick a template + edit content (2 minutes)

Scroll to **Website**. Two templates side-by-side: **Saffron** (warm) and **Slate** (modern). Click **Slate** — the card lights up with "Current".

In the **Content** section:

- **Hero headline**: A Portland neighborhood bistro, open nightly.
- **Hero subhead**: Walk-ins welcome — join the line from your phone and we'll text when your table is ready.
- **About section**: ABCD opened in 2024 on SW 10th. Our menu is seasonal, our bar is small, and our dining room is warm enough that regulars bring their parents for birthdays.
- **Contact email**: hello@abcd-demo.test
- **Instagram handle**: @abcdportland
- **Reservations note**: Walk-ins welcome — no reservations needed

Click **Save Website**.

Now the reveal: open `http://localhost:3000/r/abcd/` in the right-hand window.

> "This is what a guest who Googles ABCD will see. It's already live. Your content, your palette, your name. And every SKB-specific thing — the warm cream palette, the saffron buttons — none of that shows up here because you picked Slate."

Click Menu / About / Hours / Contact in the nav to show they all render with the right content.

---

## Part 6 · Invite staff (1 minute)

Back to the admin. Click **Staff** tab.

Point out: "You're the owner — you're always here. If you had one staff member, you'd invite them here."

Fill the invite form:
- Name: Marco Tellez
- Email: marco@abcd-demo.test
- Role: **Host** (radio: "run the floor only")

Click **Send invite**.

> "In production, Marco gets an email with a one-time link. He clicks it, sets his own password, and lands on the host view of ABCD. He can't see the admin. If you fire him, you click Revoke — his next request 401s."

Note: in the dev environment, the invite email is logged to the server console; the token is extractable but we don't click through it live.

---

## Part 7 · Print the door QR (30 seconds)

Scroll up to **Door QR** in the admin Operations tab.

> "This is the sticker you tape to your door. Scan it from your phone."

Open `https://localhost:3000/r/abcd/visit` in the right-hand window (or scan the QR from the admin). The **Restaurant Home** shows first; a guest clicks Join the Waitlist.

---

## Part 8 · A guest joins the line (1 minute)

**Surface (right window)**: `http://localhost:3000/r/abcd/queue.html`

Show the page: "A · B · C" monogram top-left, "ABCD" title, "Portland · Place in Line", 0 parties, estimated wait ~8 min. SMS consent text reads **"messages from ABCD"** — not SKB.

Fill the join form:
- Name: **Jamie K**
- Party size: **3**
- Phone: **5035559999**
- Check **Text me updates**.

Click **Join the line**.

Confirmation screen: "You're next. **ABCD-FFW**" (the code prefix is tenant-branded). "Promised by 10:21 AM · in ~8 min." Who's in line: Jamie K. (you), party 3.

> **Talking point**: "Guest's phone now polls for updates every 15 seconds. When the host seats them, this page flips to 'Your table's ready.' No app, no account."

---

## Part 9 · Host tablet view (1 minute)

**Surface (left window)**: `http://localhost:3000/r/abcd/host.html`

PIN-login card with **"ABCD · Host Stand"** title. Enter the PIN from Part 2 (the one you wrote on the whiteboard — e.g., 6867). Click **Unlock**.

The host stand appears:

- Topbar: "ABCD · Host Stand", 1 waiting, 0 dining, oldest 0m, Manual ETA 8 min, Add party button, Open Admin link.
- Tabs: **Waiting (1)**, Seated, Complete.
- Row: 1 · Jamie K · 3 · ******9999 · 10:21 AM · Actions: **Seat · Notify · Chat · Call · ✉ · ☎ · No-show**.

Click **Seat**. A dialog asks for the table number — enter **12**. Confirm.

The row moves to the **Seated** tab. If the guest's phone is still open, within 5 seconds their screen flips to "Your table's ready."

> **Talking point**: "Everything the host does is on the tablet. One PIN per device, not per person, so the tablet doesn't ask the host to log in every 12 hours. For named access — to see who seated whom, or to keep an admin out of the settings during service — that's what the staff invite from Part 6 is for."

---

## Part 10 · Cross-tenant safety (30 seconds)

(Optional, only if the owner asks "so my data is separate from everyone else's?")

Back to the left window. Change the URL bar to `http://localhost:3000/r/skb/host.html`. Enter the ABCD PIN.

Result: **Invalid PIN** (because SKB's PIN is different).

> "The same PIN that unlocks ABCD can't unlock SKB — and more importantly, ABCD's host cookie, if somehow stolen, would be rejected at `/r/skb/...` with 403 Wrong Tenant. Every query we make to the database includes your restaurant ID; you literally cannot see another restaurant's data."

---

## Part 11 · Wrap (30 seconds)

> "What you have now:
> - A public website at `/r/abcd/` that you control — address, hours, menu link, photos.
> - A host tablet URL `/r/abcd/host.html` with a PIN.
> - An owner admin at `/r/abcd/admin.html` where you configure settings and invite staff.
> - A QR sticker for your door.
> - Cross-tenant data isolation — your guests are yours.
> - Free while we're in beta. Pricing lands with a 30-day advance notice when we leave beta.
>
> When you're ready, I'll send you an email to your owner address with a welcome note and the host PIN."

Leave them the URL, the host PIN on a card, and your email.

---

## Demo-driven fixes (applied during the 2026-04-18 walk)

Walking this demo for real surfaced four multi-tenant bugs that would have been awful to catch in front of a prospective customer. All fixed in commit `demo(51): close tenant-leak bugs surfaced by ABCD demo walk`.

1. **P1 · footer contact email leaked SKB**. `public/site-config.js:135` hardcoded `skb.bellevue@gmail.com` into every tenant's footer. Fix: use `location.content.contactEmail` when present, omit otherwise.
2. **P0 · queue page showed SKB branding to every diner**. `public/queue.html` had hardcoded "SKB", "Shri Krishna Bhavan", "Bellevue", and the SMS consent text named Shri Krishna Bhavan. Fix: parameterize `{{brandName}}` / `{{brandMark}}` / `{{cityLine}}` and substitute server-side in `src/services/queue-template.ts`.
3. **P0 · party codes all prefixed `SKB-`**. Every restaurant's guests got codes like `SKB-NTH`. Fix: `generateCode(locationId)` derives a 1–4 char prefix from the slug; SKB still produces `SKB-XYZ` byte-for-byte (G5).
4. **P2 · host PIN-login card didn't show restaurant name**. `public/host.js` called an authenticated config endpoint, so the brand slot was empty on the unauthenticated login view. Fix: use the unauthenticated `/public-config` endpoint and load the brand on boot before auth check.

These bugs predated the owner-verification audit — they lived on diner-facing and tablet-login surfaces that the audit's spec-traceability grep didn't hit because they were hardcoded strings in static HTML, not API responses. The demo walk was the first time anyone actually rendered the tenant-branded diner page in a browser and looked at it. Lesson captured: any multi-tenant spec should require a live browser walk as an acceptance gate, not only an integration test pass.

---

## Fallbacks if something goes wrong live

- **Signup form rejects the email** (already registered from an earlier rehearsal): run `node scripts/demo-reset-abcd.mjs` and retry.
- **PIN doesn't work on the host**: look it up from Mongo — `node scripts/demo-show-abcd-pin.mjs`.
- **Public site shows "Address coming soon"** instead of the Portland address: the Save Site Settings click failed. Re-click it, or check Network tab for a 400 from `/api/host/site-config`.
- **The guest's queue page shows "Shri Krishna Bhavan"**: this means the server hasn't been restarted since the demo-fix commit. `npm start` again.
- **The host view shows 401 errors after PIN login**: a stale `skb_session` cookie from a prior signup is overriding the PIN. Open dev tools → Application → Cookies → delete `skb_session`. Or use an incognito window.

---

## Script inventory

Files this demo uses that weren't part of the spec:

- `scripts/demo-reset-abcd.mjs` — wipes the ABCD location + user + memberships + queue_entries.
- `scripts/demo-show-abcd-pin.mjs` — prints the ABCD location's PIN (for when the rehearser forgot it).

Both are dev-only operational helpers; they're not shipped to prod.
