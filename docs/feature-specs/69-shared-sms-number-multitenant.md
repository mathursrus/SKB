# Feature Specification — Issue #69

**Title:** Multi-tenant SMS/voice routing with a single shared OSH toll-free number
**Status:** Draft
**Owner:** sid.mathur@gmail.com
**Related issue:** https://github.com/mathursrus/SKB/issues/69
**Related specs:**
- [#51 fully multi-tenant system](./51-fully-multi-tenant-system.md) — parent epic
- [#31 phone system integration of waitlist](./31-phone-system-integration-of-wait-list.md) — existing voice/IVR spec
- [#29 sms users when host calls them](./29-sms-users-when-host-calls-them.md) — outbound SMS UX
**Related mocks:** [`mocks/69-admin-sms-settings.html`](./mocks/69-admin-sms-settings.html)

---

## 1. Why (Problem & Motivation)

OSH became multi-tenant in epic #51 at every layer except telephony. The app code routes by URL path (`/r/:loc/...`) and every record is scoped by `locationId` — but the Twilio integration still assumes one tenant: one `TWILIO_PHONE_NUMBER` env var, one webhook URL, one account. Each Twilio number also has exactly one voice webhook URL and one SMS webhook URL, so **in practice each new tenant today would need their own Twilio number**. On a long code (10DLC), that means each tenant's own EIN registered as its own brand, its own campaign attached, and a 1–3 week carrier approval gate before they can send a single SMS.

That's a bad onboarding story. The whole point of self-serve multi-tenancy (#51) is that a restaurant owner signs up from their phone at their own restaurant and is live in ten minutes. A two-week approval wait breaks that promise.

**Why toll-free instead of a shared long code:** The obvious shortcut — "register one OSH long code under one OSH brand and let all tenants share it" — is carrier policy grey area. A2P 10DLC explicitly requires one brand per campaign, with a narrow "franchise" exception that is rarely granted to multi-restaurant platforms. Carriers can (and do) filter messages they interpret as brand impersonation. **Toll-free messaging is not subject to 10DLC**: Twilio's Toll-Free Verification (TFV) flow is the documented ISV path — one platform brand verifies once, and all downstream businesses sent on behalf of under that ISV are covered without their own verifications. This is a mainstream, widely-used pattern — Waitwhile, HubSpot, Intercom, and similar multi-tenant SaaS products operate this way in production. TFV review is ~1–3 weeks (possibly one revision round); it's a **one-time platform-level wait**, after which every new tenant inherits coverage with zero additional approval. That's the pattern this spec adopts.

### 1.1 The current gap

| Aspect | Today | Target |
|---|---|---|
| SMS sender number | Single long-code `TWILIO_PHONE_NUMBER`, works for one tenant (`skb`) | One shared OSH-owned **toll-free** number; every tenant sends from it |
| New-tenant SMS setup time | Provision a number, register brand, register campaign, wait 1–3 weeks | Zero — inherits OSH's pre-approved Toll-Free Verification automatically |
| Inbound SMS routing | URL path `/r/:loc/api/sms/inbound` encodes tenant; Twilio must POST to tenant-scoped URL, which a shared number can't do | Tenant-agnostic `/api/sms/inbound` that resolves tenant from the sender's phone by looking up active queue entries |
| Outbound sender identity | Hardcoded `"SKB:"` prefix in every template (`src/services/smsTemplates.ts`) | Per-tenant display name prefix, resolved at send time from the location record |
| Voice/IVR number | Same shared `TWILIO_PHONE_NUMBER` | Per-tenant, opt-in dedicated voice long-code (voice is not subject to 10DLC or TFV — provisions in minutes) |
| Carrier registration | Implicitly one 10DLC brand+campaign per tenant | Exactly one Toll-Free Verification, under OSH, covering all tenants |
| STOP / opt-out | Scoped to one number, effectively one tenant | Carrier-level STOP on the shared number blocks *all* tenants for that phone — must be surfaced to diners and operators honestly |

### 1.2 Why this matters now

The multi-tenant epic (#51) is landing its admin, auth, and onboarding pieces (#52/#53/#57). The first externally-onboarded tenant will hit "connect SMS" immediately after signup. If that step takes two weeks and a hundred dollars of brand registration per tenant, the product is not actually self-serve. This spec unblocks everything downstream: the #51 onboarding wizard, the #57 marketing landing page conversion funnel, and any paid or free trial motion.

### 1.3 Goals

- **G1** A newly-signed-up restaurant can send and receive SMS within **5 minutes of signup**, with no developer involvement and no A2P 10DLC wait.
- **G2** Zero per-tenant incremental Twilio cost for SMS (beyond the per-message rate). New tenants cost **$0/month** in telephony fees until they opt into a vanity voice number or their own dedicated SMS number.
- **G3** Diners receiving SMS can tell which restaurant the message is from at a glance, even though all restaurants share one sender number.
- **G4** Inbound SMS replies from a diner land in the correct restaurant's chat thread automatically, without the diner having to type a restaurant name or code.
- **G5** The existing SKB Bellevue deployment (`skb` slug, current Twilio number, current production behavior) continues to work with no observable change to diners or hosts during and after rollout.
- **G6** Voice/IVR remains optional and per-tenant. Tenants that want a branded phone-in waitlist get a dedicated voice number in minutes; tenants that don't want voice are not charged and not required to set one up.

### 1.4 Non-goals (explicit v1 scope cuts)

- **Migrating SMS from Twilio to Azure Communication Services.** Tracked separately in #33; this spec is carrier-agnostic in intent but implemented on Twilio.
- **Twilio subaccounts per tenant.** Billing isolation is a future concern. Subaccounts don't remove the carrier-verification requirement — they complicate it. Out of scope.
- **Short codes.** More expensive, longer approval, overkill for current volume.
- **Vanity sender names via alphanumeric sender IDs.** Not supported on US long codes or toll-free.
- **Sharing a 10DLC long code across tenants under one OSH brand.** Explored and rejected on carrier-policy grounds (see §7 and §9). Toll-free is the compliant path for ISV-style multi-business sending.
- **Per-tenant custom outbound throughput.** Toll-free numbers typically throttle at ~3 MPS uncapped with daily carrier caps once verified. Tenants exceeding that are a scaling problem, tracked as a future issue — not a blocker for onboarding.
- **Automatically provisioning per-tenant dedicated numbers** (for vanity). Opt-in flow is manual-operator-assisted in v1; UI self-serve is a later enhancement.
- **Renaming `TWILIO_PHONE_NUMBER` env var or the `/r/:loc/api/sms/inbound` backward-compat route.** Legacy names stay; new names live alongside.

---

## 2. Who (User Profiles)

| Persona | Primary concern | How this feature touches them |
|---|---|---|
| **Newly-signed-up restaurant owner** | "How fast can I actually text my guests?" | Sees "SMS is active — you'll send from (206) 555-OSHH" in the onboarding wizard. No setup. No wait. |
| **Active restaurant owner** | "Make sure guests know the text is from *my* restaurant." | Sets a display name ("Shri Krishna Bhavan" vs "SKB") in admin SMS settings; preview shows exactly what diners will see. |
| **Host / front-desk operator** | "The diner I just called back replied — did that reach me?" | No change. Inbound replies continue to appear in the party's chat thread on the host tablet. |
| **Diner** | "I got a text — who's it from?" | First line of every OSH text is the restaurant's name. Reply thread is private to that restaurant. |
| **Diner who replies STOP** | "I don't want any more texts." | Carrier blocks all future messages from the shared number. Spec surfaces this honestly: if the diner later joins a waitlist at a different OSH restaurant, that restaurant won't reach them by SMS either until they reply START. |
| **Platform operator (Sid)** | "Don't make me provision a number per tenant." | One-time: register OSH brand + one campaign. From then on: nothing. |

---

## 3. Customer's Desired Outcome

> **Restaurant owner (first five minutes after signup):** "I just created my restaurant account. I added my logo and hours. I clicked 'Send me a test text' and it arrived — on the first try, no phone-number purchase, no compliance form, nothing. The text said my restaurant's name at the top, not some generic platform name. Now I can invite my friend to join my test waitlist and we'll both see it work."
>
> **Diner at their third OSH-powered restaurant this year:** "I get a text that says 'Shri Krishna Bhavan: Your table is ready.' I know exactly who it's from. When I reply 'running 5 min late', it lands in the right restaurant's host chat. I don't have to type a code, remember a keyword, or download anything."

## 4. Customer Problem Being Solved

Every SMS platform targeting US long codes hits the same A2P 10DLC wall: each brand + campaign combination is registered with The Campaign Registry, carriers review it, and approval takes 1–3 weeks. Carrier policy explicitly requires **one brand per campaign** (no two unrelated businesses on the same campaign), so "share one long code across all restaurants under one OSH brand" is a compliance grey area that carriers like T-Mobile filter against without a rarely-granted franchise exemption. For a self-serve product onboarding restaurants one at a time, the per-tenant 10DLC path is prohibitive both in wall-clock time and in cash outlay.

**The compliant answer is a shared toll-free number.** Toll-free numbers (8YY) fall outside 10DLC rules. Twilio's Toll-Free Verification (TFV) flow is specifically designed for ISV / SaaS platforms that text on behalf of many downstream businesses: one platform-level brand, one verification, unlimited downstream clients sending through the verified number. Approval takes 1–3 weeks — **once, for OSH as a platform**. Every new restaurant that signs up after that inherits coverage with zero additional approval.

The remaining question — "if the number is shared, how does anyone know which restaurant is texting?" — is answered by the two mechanisms below:
1. **Outbound:** restaurant display name prefix in every message body.
2. **Inbound:** resolve tenant from `From` phone against active queue entries; disambiguate only on true collision.

## 5. User Experience That Will Solve the Problem

### 5.1 Owner onboarding (new tenant)

1. Owner completes signup in `/signup` (existing #52/#53 flow).
2. Onboarding wizard shows a step: **"SMS is ready."** Copy:
   > *"Your restaurant will send and receive texts from **(855) 555-0199** — a toll-free number shared by all restaurants on OSH. Guests will see your restaurant name at the top of every message: **'Shri Krishna Bhavan: Your table is ready…'**. Want your own local number later? You can add a dedicated SMS or voice number in Settings."*
3. "Send me a test text" button sends the current template with the owner's display name prefix to the owner's phone (number from their account).
4. The wizard step is marked complete automatically once the owner receives the test text (status callback confirms `delivered`).

### 5.2 Owner SMS settings

In the admin area under **Settings → Messaging**:
- **Sender display name** (editable) — defaults to the location's `name`. Max 30 chars. Live preview shows the first 2 lines of a table-ready message with the current name.
- **Sending number** (read-only) — "(855) 555-0199 (shared toll-free)" with a subtitle: "All OSH restaurants send from this number. Guests identify yours by the name at the top of each message."
- **Upgrade options** (collapsed section) — "Get your own local SMS number" (contact support — manual in v1, requires the restaurant's own 10DLC registration, 1–3 week carrier approval) and "Add a voice/IVR number" (link into the voice setup flow, opt-in, fast).

Mock: [`mocks/69-admin-sms-settings.html`](./mocks/69-admin-sms-settings.html)

### 5.3 Diner sends/receives SMS (happy path)

- Diner joins waitlist at restaurant A. Outbound text:
  > *"Shri Krishna Bhavan: You're on the list! Track your place in line here: https://…/status/ABC1. Code: ABC1"*
- Diner replies "thanks, running 10 late".
- System finds exactly one active queue entry for that phone (at restaurant A today). The reply lands in restaurant A's host chat thread for that party. Unchanged UX for diner and host.

### 5.4 Diner reply with ambiguous sender (collision)

Rare case: diner is on the waitlist at restaurant A and restaurant B the same day. They reply to what they think is restaurant A's text. System finds two matches.

- System auto-replies (one time, then caches the decision for that diner's phone + service day):
  > *"Hi — you're currently on the list at two OSH restaurants. Please reply with the restaurant name so we can route your message: **Shri Krishna Bhavan** or **Bellevue Pizza House**."*
- Diner replies "skb" or "shri krishna" or "bhavan". System fuzzy-matches against the `name` of each candidate location. If exactly one matches, cache `(phone, serviceDay) → locationId` and append the *original* pending message to that thread.
- If no match or multiple matches, reply:
  > *"Sorry, I couldn't tell which restaurant. Please reply with the restaurant name exactly as shown above."*

Collisions are expected to be < 1% of inbound traffic at current volume (single-user dining at 1 restaurant per evening).

### 5.5 Diner replies STOP (opt-out)

- Twilio honors STOP on the shared number: that phone cannot receive any further messages from the number, across all tenants.
- App records the opt-out in a new `smsOptOuts` collection keyed by `phone` (not by tenant). Every outbound send checks this collection first; suppressed sends are logged but not dispatched (avoids wasted Twilio API calls that would fail anyway).
- If the diner later joins a waitlist at a different OSH restaurant and tries to use SMS, the host sees a banner on the queue entry: *"This diner has opted out of OSH texts. Please notify them in person or by phone."* A link offers to send opt-in instructions.

### 5.6 Diner cold-inbounds (no active queue entry)

Unchanged from today's behavior: log `sms.inbound.unmatched`, do not reply, do not open a thread.

### 5.7 Voice/IVR (opt-in, per tenant)

- At onboarding, the owner sees: *"Want guests to be able to call in to join the waitlist? [Set up voice] — takes about 5 minutes and costs $1/month."*
- Clicking [Set up voice] runs an operator-assisted flow (v1): Sid provisions a Twilio voice number, sets its webhook to `/r/<slug>/api/voice/incoming`, and writes `location.twilioVoiceNumber` and `location.voiceEnabled = true`.
- If the owner skips, voice is not available for that tenant. The queue-only SMS flow is unaffected. The `frontDeskPhone` field (used for human-handoff mid-IVR) remains relevant only for tenants with voice enabled.

---

## 6. Functional Requirements

**R1** The system SHALL maintain exactly one shared Twilio **toll-free** phone number (8YY) for outbound and inbound SMS across all tenants, configured via the existing `TWILIO_PHONE_NUMBER` env var.

**R2** The shared toll-free number SHALL be verified via Twilio Toll-Free Verification (TFV) under OSH's platform brand, with use-case attributes describing ISV-pattern waitlist notifications sent on behalf of restaurants hosted on OSH. All tenants SHALL inherit this verification without filing their own. The spec SHALL NOT use A2P 10DLC for the shared number, because 10DLC's one-brand-per-campaign rule forbids sharing a long code across unrelated restaurant brands without a rarely-granted franchise exemption.

**R3** Every outbound SMS body SHALL begin with the tenant's display name followed by `": "`, e.g., `"Shri Krishna Bhavan: Your table is ready…"`. The display name SHALL be resolved at send time from the location record, not hardcoded.
- *Given* `location.smsSenderName` is set, *when* any outbound message is composed, *then* the body SHALL start with `{smsSenderName}: `.
- *Given* `smsSenderName` is absent, *when* composing, *then* fall back to `location.name`.
- *Given* `location.name` is also missing, *when* composing, *then* use the string `"OSH"` as a last-resort fallback.

**R4** The system SHALL expose a tenant-agnostic inbound SMS webhook at `POST /api/sms/inbound`. Twilio's shared-number inbound webhook SHALL point to this URL. The existing `POST /r/:loc/api/sms/inbound` SHALL remain as a deprecated compatibility path.

**R5** On receiving inbound SMS at `/api/sms/inbound`, the system SHALL resolve the target tenant as follows:
- Normalize the sender's `From` to 10 digits.
- Check `smsOptOuts` for the phone — if opted out, log and reply with nothing.
- If the body matches any of the regex patterns `^(stop|unsubscribe|end|quit|cancel)\b` (case-insensitive), upsert `smsOptOuts` and return 200 with no TwiML.
- If the body matches `^(start|unstop)\b`, delete from `smsOptOuts` and return 200 with no TwiML (Twilio auto-replies with the START message).
- Otherwise, query `queueEntries` across **all** locations for `{phone: normalized, serviceDay: today, state: {$in: [waiting, called, seated, ordered, served, checkout]}}`.
  - *Given* exactly one active entry matches, *when* resolving, *then* append to that location's chat thread and return 200.
  - *Given* two or more active entries match across different locations, *when* resolving, *then* trigger the disambiguation flow (R6).
  - *Given* zero active entries match, *when* resolving, *then* log `sms.inbound.unmatched` and return 200 with no reply (behavior preserved).

**R6** For collision cases, the system SHALL:
- Reply with a disambiguation SMS listing the candidate restaurants by display name.
- Persist the pending inbound message in a new `pendingDisambiguation` record keyed by `{phone, serviceDay}` with TTL of 4 hours.
- On the next inbound from that phone the same service day, fuzzy-match the body against candidate `name`s (normalize case, strip punctuation, accept substring match ≥ 3 chars). If a single match, resolve, flush the pending message into that location's thread, and cache `{phone, serviceDay} → locationId` for 8 hours. Any subsequent inbound from that phone that day skips lookup and routes to the cached location.
- If fuzzy-match fails, reply with a clarification prompt and keep the pending record.

**R7** The system SHALL store opt-outs in a new collection `smsOptOuts` with schema `{ phone: string (10-digit), optedOutAt: Date, lastSeenTenants: string[] }`. `lastSeenTenants` is informational for operator debugging only. Every outbound send SHALL check this collection and abort with `status=opted_out` if found.

**R8** The admin SMS-settings panel SHALL allow an owner/admin to set `location.smsSenderName` with these constraints:
- 1 to 30 characters.
- ASCII only (no emoji, no extended Unicode — carriers strip or reject).
- Shown in a live preview reflecting the current table-ready template.

**R9** The `location` schema SHALL gain optional fields:
- `smsSenderName?: string`
- `twilioVoiceNumber?: string` (E.164, e.g., `+12065550100`) — present iff voice is provisioned for this tenant.
- `twilioVoiceNumberSid?: string` — Twilio resource SID for admin reference.

**R10** When a tenant opts into a dedicated voice number, the system SHALL route that number's voice webhook to `/r/<slug>/api/voice/incoming`. Voice logic itself (per #31) is unchanged. Voice numbers are long codes (not toll-free) to preserve local area-code caller ID; voice is not subject to 10DLC or TFV.

**R11** The system SHALL NOT accept inbound voice calls on the shared SMS number. Twilio voice webhook for the shared number SHALL return a polite TwiML message directing the caller to the restaurant's phone number (if we can identify the tenant from the caller's phone — same lookup as SMS) or a generic "please visit osh.example.com to find the restaurant you're looking for" message.

**R12** The onboarding wizard SHALL include an "SMS is ready" step that:
- Displays the shared number and shows the owner how their display name will appear.
- Offers a "Send me a test text" button that delivers the join-confirmation template to the owner's phone using the new prefix logic.
- Marks itself complete when the test message's `statusCallback` reports `delivered`.

**R13** The SKB Bellevue tenant (slug `skb`) SHALL migrate to the new prefix logic with `smsSenderName = "Shri Krishna Bhavan"` (not `"SKB"`). The migration SHALL be a one-time script that sets the field on that record; no downtime required; SMS templates continue to function before and after.

### 6.1 Edge cases

- **Phone number format edge:** Twilio sometimes sends `From` with or without `+1`. `appendInbound` already normalizes via `replace(/\D/g,'').replace(/^1/,'').slice(-10)` — reuse this function in the new resolver.
- **Two-way use-case coverage:** Outbound and inbound on the same toll-free number — no special config beyond declaring both directions in the TFV submission. v1 scope is notification-only (no marketing content), which TFV reviewers treat as the simplest approval profile.
- **Display-name collision across tenants:** Two restaurants both named "Pizza House" is possible but fine — the diner sees the name in the SMS and the inbound resolution uses phone, not name. Fuzzy-match during disambiguation only kicks in for collisions, which by definition are among specific candidate tenants the diner is on the list at.
- **Post-cache-expiry reply:** If the cache key expires (8h) and the diner replies the next day while on another tenant's list, normal one-match resolution kicks in. Not a bug.
- **Opt-out re-consent:** If a diner previously replied STOP and later joins a new waitlist via the web (which doesn't send SMS until host calls them), the host-initiated SMS call SHALL be suppressed and the host SHALL see the opt-out banner (R7 + R8 host UI).

---

## 7. Compliance Requirements

Project compliance config is not set in `fraim/config.json`; requirements below are inferred from US Toll-Free Verification, A2P 10DLC (for the opt-in dedicated-number upgrade path only), TCPA, and CTIA guidelines that apply to any US SMS-sending application.

### 7.1 Why not A2P 10DLC for the shared number

Carrier policy requires each 10DLC campaign to be bound to **one brand**. A campaign covering many unrelated restaurant brands violates this rule absent a franchise exemption, which is rarely granted outside single-brand franchise systems (e.g., one company's 500 franchised stores). Carriers — T-Mobile especially — filter or block messages they interpret as brand impersonation. Per Twilio's own 2026 ISV guidance, the correct pattern for sending on behalf of many unrelated small businesses is Toll-Free Verification, not a shared 10DLC campaign. This spec takes the toll-free path.

### 7.2 Toll-Free Verification (TFV)

- **Platform-level verification.** OSH submits one TFV request under its own brand, covering the ISV/SaaS use case (two-way notifications for restaurant guests on the OSH platform). One-time review, typically 1–3 weeks after submission.
- **Required fields.** Business name, EIN, address, contact info, opt-in method description, opt-in proof (screenshot of the join form with the consent disclosure), sample messages (both outbound templates with the restaurant-name prefix), expected monthly volume, use-case category ("ISV – multi-tenant"), and the privacy policy URL.
- **Opt-in disclosure on the join form.** The web join form SHALL display a consent disclosure near the phone input: *"By providing your number, you agree to receive SMS about your waitlist status from the restaurant and from OSH on its behalf. Msg & data rates may apply. Reply STOP to opt out, HELP for help."* Required as TFV evidence.
- **Number status.** Twilio toll-free numbers cannot send SMS to US/Canada until TFV is approved. Keep the existing Twilio long code as a fallback sender for the `skb` tenant until TFV is approved, then cut over.
- **Ongoing compliance.** Re-verify when the sending use case materially changes (e.g., adding marketing content — out of scope in v1).

### 7.3 A2P 10DLC (only for the opt-in dedicated-number upgrade path)

Tenants who elect to pay for a dedicated local SMS number (§5.2 "Upgrade options") fall under standard 10DLC rules:
- Each such tenant registers as their own brand under their own EIN.
- One campaign per tenant, use case "account notification".
- Approval 1–3 weeks. Per-number ~$1.15/mo; per-campaign ~$10/mo; one-time ~$4 brand registration.
- OSH's admin tooling guides the tenant through the Twilio console flow but does not register on their behalf (avoids Reseller-ID complications in 2026+).

### 7.4 TCPA (US federal)

- **Prior express consent.** Capturing phone at join time + displayed consent copy (per §7.2) satisfies this for transactional messages. No marketing messages in v1 scope.
- **STOP honoring.** Mandatory per TCPA + CTIA. Carrier-level STOP is automatic on the toll-free number; app-level `smsOptOuts` enforces it beyond carrier blocks so that code paths don't try to send and generate noise in logs.
- **Record-keeping.** Retain opt-in evidence (timestamp, phone, source page) for at least 4 years per TCPA defense practice. Existing `queueEntries` already records `joinedAt` and `phone`; confirm this retention meets bar — if not, extend.

### 7.5 CTIA Messaging Principles

- **Sender identity on every message.** Toll-free and shared-sender use is permitted when the sender identifies itself in the body. R3 (display-name prefix) implements this.
- **HELP response.** On `HELP` keyword, reply with a platform-level message: *"OSH: Msgs about your restaurant waitlist. Reply STOP to unsubscribe. Support: support@osh.example.com. Msg&data rates may apply."* Implement in the `/api/sms/inbound` handler alongside STOP/START.
- **No content disallowed by carrier rules** (gambling, cannabis, hate, sex). Not a current v1 concern.

### 7.6 Compliance Validation

- **TFV approval:** confirm toll-free number status = `TWILIO_APPROVED` in the Twilio console before cutover.
- **STOP/HELP/START round-trip test:** manual test via Sid's phone against staging, verify carrier-level and app-level suppression.
- **TCPA consent copy:** screenshot of current join form, reviewed against CTIA's latest messaging principles (`ctia.org/messaging-principles`), filed in `prod-validation/`.
- **Opt-out ledger:** confirm `smsOptOuts` is populated on staging after a STOP and that subsequent outbound attempts are suppressed (logged, not dispatched).
- **TFV documentation on file:** archive the approved TFV submission (screenshots of each form field) in `prod-validation/` for regulatory audit.

---

## 8. Validation Plan

**Feature validation**

1. Bring up staging with a second test tenant (e.g., `osh-demo-2`) so both `skb` and `osh-demo-2` are active.
2. Join waitlist as "Alice" at `skb` with phone X. Verify the confirmation SMS arrives with prefix `"Shri Krishna Bhavan: "`.
3. As Alice, reply `"running late"`. Verify the message appears only in `skb` host chat for Alice's party, not `osh-demo-2`.
4. Join a second waitlist as Alice at `osh-demo-2` (same phone, same day). Reply `"10 min"`. Verify the disambiguation prompt arrives. Reply with `osh-demo-2`'s display name. Verify the original message lands in `osh-demo-2`'s chat thread, not `skb`'s.
5. Reply `STOP`. Verify `smsOptOuts` contains Alice's phone and a subsequent host-initiated call attempt on `skb` is suppressed with the opt-out banner on the host tablet.
6. Reply `START`. Verify `smsOptOuts` row is removed and the next call attempt sends.
7. Provision a voice number for `osh-demo-2`, set its webhook to `/r/osh-demo-2/api/voice/incoming`. Call the number, verify the existing IVR flow from #31 runs for that tenant. Call the shared number, verify the "visit website to find restaurant" TwiML plays and no IVR is entered.
8. From the admin SMS settings panel on `osh-demo-2`, change the display name, send a test text, verify the new name appears on the next outbound.

**Compliance validation**

Per §7.4.

**Production cutover validation**

- Confirm the Toll-Free Verification status is `TWILIO_APPROVED` before switching outbound templates to the new prefix logic and before pointing production at the toll-free number.
- Run the `smsSenderName` backfill script for `skb`; confirm the next scheduled or host-triggered SMS uses `"Shri Krishna Bhavan: "` not `"SKB: "`.
- Monitor Azure Log Analytics `sms.delivery_failed` events for 72 hours post-cutover. Rollback criterion: >1% of sends in any 30-minute window return error code 30032 (toll-free not verified), 30007 (carrier filtering), or 30034 (10DLC — should not fire on a toll-free number; if it does, we're configured wrong).

---

## 9. Alternatives

| Alternative | Why discard? |
|---|---|
| **Dedicated 10DLC long code per tenant** | Each tenant registers their own 10DLC brand + campaign (~$4 one-time + ~$10/mo + ~$1.15/mo number), waits 1–3 weeks for carrier approval. Breaks the "live in 5 minutes" promise. Kept as an opt-in upgrade for tenants who want a local vanity number. |
| **Shared 10DLC long code under one OSH brand** | The "obvious" path is not compliant. Carriers require one brand per 10DLC campaign, and the franchise exemption is rarely granted to multi-tenant platforms. Messages would be subject to filtering (error 30007) or blocking; this is what the toll-free path exists to solve. Considered and rejected in favor of TFV. |
| **Twilio subaccounts per tenant** | Subaccounts give billing isolation but don't remove carrier verification requirements. Each subaccount's sender still needs a registered brand/campaign or verified toll-free. Adds complexity without solving the stated problem. |
| **Shared number + SMS keyword on first contact** ("Text JOIN SKB to …") | Works for SMS-to-join, not for replies. Diner has to know and type a keyword. Worse UX for replies to host-initiated texts, which is the common case. Also doesn't sidestep the carrier-verification requirement. |
| **Shared number + IVR menu for voice** | "Press 1 for SKB, 2 for Pizza House…" collapses at scale, bad UX, and cheap alternative (per-tenant voice number, $1/mo, instant) exists. |
| **Alphanumeric sender ID** (e.g., `SKB` as the sender) | Not supported on US long codes or toll-free. Works internationally but not in our target market. |
| **Short code** (5–6 digit number) | $1000+/mo rental + 8–12 week approval. Massively overbuilt for current scale. Reconsider if/when volume exceeds toll-free throughput ceilings. |
| **SMS via a different provider** (Plivo, Bandwidth, Sinch) | Same 10DLC and TFV rules apply to any US SMS provider — these are carrier-level, not vendor-level. Switching vendors is an ACS/#33 topic, not a compliance lever. |
| **RCS or iMessage business channels** | Require Apple/Google business verification, limited US penetration for restaurant use cases today. Revisit in a future issue; not ready as a primary channel. |

---

## 10. Competitive Analysis

### 10.1 Primary competitors (restaurant waitlist category)

| Competitor | SMS sender model | Strengths | Weaknesses | Relevance to us |
|---|---|---|---|---|
| **Waitlist Me** (waitlist.me/support/premium-area-code) | **Dedicated number per restaurant account** — each customer gets a unique number in the area code of their choice at signup. | Restaurant-branded caller ID, local area code. | Every new customer needs a new number provisioned + verified (likely 10DLC per customer if long-code). Not consistent with "5-minute onboarding." | Opposite of our approach — this is the upgrade path we offer, not the default. |
| **Waitwhile** (help.waitwhile.com) | **Shared sender by default** on Starter/Business; **dedicated number as Enterprise-only upgrade** used mainly for Text-to-Join. | Fast default onboarding, dedicated upsell for bigger customers. | Shared-sender details (toll-free vs. long-code, carrier-verification status) not publicly documented. | Validates the two-tier model exactly as proposed (shared default, dedicated premium). |
| **TablesReady** (tablesready.com) | SMS-centric — shared number for join-by-SMS and notifications; restaurants branded by name in message body. | Join-by-SMS is well-integrated. | Public docs don't detail the compliance architecture. | Consistent with in-body sender identification, same pattern we're adopting. |
| **NextMe** (nextmeapp.com) | Shared number, custom templates, in-body branding. | Simple pricing. | Same opacity on carrier architecture. | Same pattern again — in-body identification is the industry default for shared senders. |
| **Yelp Waitlist** (Twilio case study) | Two-way SMS on Twilio across all restaurants; architectural specifics not disclosed. Separately, Yelp has described phone-number masking engineering work. | Scale-proven. | Architecture not publicly documented. | Confirms large-scale two-way SMS on Twilio is viable for a multi-tenant product; doesn't disclose the ISV pattern they use, but their scale (hundreds of thousands of restaurants) means they almost certainly use toll-free or have a T-Mobile franchise-exemption-equivalent agreement. |

### 10.2 Adjacent patterns (SaaS platforms that send SMS on behalf of many clients)

| Competitor / pattern | Approach | Takeaway |
|---|---|---|
| **Twilio TFV ISV docs** (twilio.com/docs/messaging/compliance/toll-free) | ISV submits one TFV on its platform brand; platform sends on behalf of downstream clients from the verified toll-free number. | This is literally our plan. Well-trodden path with first-party Twilio tooling. |
| **Slang AI / Popmenu / GoodCall** (voice-AI for restaurants) | Per-tenant dedicated phone number for voice; no 10DLC wait because voice is not regulated the same way. | Matches our voice approach — per-tenant long code for IVR, no shared number for voice. |
| **SimpleTexting / EZ Texts / bulk SMS platforms** | Shared toll-free with tenant name prefix, or dedicated long-code with per-tenant 10DLC as an upgrade. | Confirms toll-free-shared + long-code-upgrade is the standard SaaS pattern. |

### 10.3 Competitor analysis (out-of-scope tools)

The following `fraim/config.json` competitors are not waitlist-adjacent and do not influence this spec: **Squarespace, Wix Restaurants, BentoBox, Popmenu marketing site, Menubly, the Mise family (TryMise, Mise.digital, Meez, Misenplace AI, DiscoverMise, MEP Hospitality), Sofra Restaurant, MySofra UAE, Aatithya HMS, Atithi (spinfocom & UEPL)** — these are website builders, kitchen-ops tools, or PMS/hotel systems that don't send guest-facing waitlist SMS. Flagged for Phase 4 reviewer that these were explicitly evaluated and found irrelevant to the multi-tenant-SMS-routing question.

### 10.4 Our differentiation

- **Key advantage 1:** 5-minute SMS activation for a new tenant. Waitlist Me requires per-tenant number provisioning and, for US long codes, per-tenant 10DLC approval. Our TFV-once-at-platform design eliminates both.
- **Key advantage 2:** Two-way chat (not just broadcast) routes cleanly across tenants via the phone-lookup resolver — most shared-sender systems only solve outbound cleanly.
- **Key advantage 3:** Zero marginal SMS infra cost per new tenant, so free-trial and freemium economics work from day one. Waitwhile makes dedicated numbers an Enterprise upsell; we make them available to any paying tenant without inverting the default.

### 10.5 Research sources

- Twilio Toll-Free Verification docs (`twilio.com/docs/messaging/compliance/toll-free/console-onboarding`).
- Twilio A2P 10DLC docs, ISV guidance (`twilio.com/docs/messaging/compliance/a2p-10dlc`, accessed 2026-04).
- Telnyx "ISVs & 10DLC" help center article on brand-per-campaign constraints.
- CTIA Messaging Principles and Best Practices (`ctia.org`).
- Waitlist Me area code support page (`waitlist.me/support/premium-area-code/`, accessed 2026-04).
- Waitwhile help center articles on SMS pricing and dedicated numbers (`help.waitwhile.com`, accessed 2026-04).
- Yelp–Twilio customer case study (`customers.twilio.com/en-us/yelp`).
- Prior SKB Twilio spike evidence in `prod-validation/` and project memory.

Research methodology: targeted WebSearch + WebFetch on the competitors enumerated in `fraim/config.json` plus the Twilio/carrier primary sources; evaluated against the spec's central question ("how do competitors architect multi-tenant SMS and what compliance path do they use?"). Date of research: 2026-04-23.

---

## 11. Design Standards Applied

Generic UI baseline (project-specific design system not configured in `fraim/config.json`). The admin SMS-settings mock reuses the existing admin surface styling from `public/admin.html` — same type scale, same neutral palette, same form-row layout as other Settings tabs in #51's admin refactor. No new design primitives introduced.

---

## 12. Open Questions

- **STOP propagation audit:** Is there any tenant-specific legal obligation to *not* block tenant B just because the diner said STOP to tenant A's message? (Our position: carrier blocks it regardless, and maintaining a per-tenant opt-in workaround is a compliance risk. Proceed with global suppression and surface honestly.)
- **HELP message copy:** Brand as "OSH" (platform) or let tenants customize? Recommend platform-level for simplicity in v1, tenant-level HELP copy in a future issue.
- **TFV throughput:** Verified toll-free numbers have a default tier that depends on use-case volume declared at submission time. Declare conservatively (<2k msg/day) to accelerate approval, or optimistically to avoid a re-verification as volume grows? Recommend declaring **projected 12-month volume** with a 2× buffer to balance.
- **Toll-free prefix choice:** 800, 833, 844, 855, 866, 877, or 888? Functionally identical; 833 and 844 are newest and most available. Recommend 833 or 844 for best availability; no user-facing difference.
- **SKB legacy long code fate:** Keep the existing Twilio long code on `skb` as a failover for a month post-TFV cutover, then release? Or release immediately on TFV approval? Recommend keep 30 days to cover edge cases (saved-sender-in-phone contacts, etc.).
- **Migration ordering with #33 (ACS):** If ACS migration lands first, does this spec's Twilio-specific implementation reset? Position: implement on Twilio now (unblocks #51); port to ACS under #33 when that lands. The ISV/shared-toll-free pattern is carrier-agnostic in intent; ACS has its own equivalent verification flow. Only the SDK calls and the verification paperwork change.
- **Worst-case TFV rejection:** TFV approval is expected first pass with maybe one revision cycle (standard for any carrier review). If OSH's ISV submission is repeatedly denied for reasons we can't resolve with Twilio support — an unlikely sky-falls scenario — the contingency is to fall back to the per-tenant 10DLC upgrade path (§5.2), which is Waitlist Me's model and equivalent to status quo. Not a planned path; worth documenting once so the plan isn't silently dependent on a single approval.
