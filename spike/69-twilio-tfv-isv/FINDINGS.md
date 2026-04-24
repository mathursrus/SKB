# Spike Findings — Twilio TFV for ISV / Multi-Tenant SMS (Issue #69)

**Date:** 2026-04-23
**Driver:** Claude
**Timebox:** ~30 minutes, docs-only (no live Twilio console — did not need it; docs were decisive)

## Hypothesis (from spec §1.2 and spec PR #70)

> OSH submits **one** Twilio Toll-Free Verification under its own platform brand, covering all downstream restaurant tenants. One-time ~1–3 week wait; every new tenant inherits coverage with zero additional approval. ISV pattern; well-trodden path.

## Method

Primary-source research against Twilio's TFV + ISV documentation. Specifically:
- `twilio.com/docs/messaging/compliance/toll-free/api-onboarding` — required fields for TFV requests.
- `twilio.com/docs/messaging/compliance/toll-free/console-onboarding` — console submission flow.
- `help.twilio.com/articles/13263383206299-Toll-Free-Verification-for-ISVs` — ISV-specific guidance (found via search snippet; article body was gated).
- `twilio.com/en-us/blog/developers/best-practices/direct-customer-to-isv-rearchitecture-guide` — decisive: describes the rearchitecture path for single-tenant Twilio customers becoming compliant ISVs.
- `twilio.com/docs/messaging/compliance/toll-free/compliance-embeddable-onboarding` — the Compliance Embeddable feature, Twilio's officially blessed multi-tenant onboarding UI.
- `twilio.com/en-us/changelog/retrieve-toll-free-verification-records-across-subaccounts` — confirms subaccount-per-tenant architecture.

Live Twilio console spike was **not run**. Docs alone were definitive on the primary question. A live console pass remains useful for implementation planning (exact field names, typical rejection reasons) but is not needed to pick the architecture.

## Findings

### F1 — One TFV does not cover multiple downstream businesses

Twilio's "Direct Customer to ISV Rearchitecture Guide" is explicit:

> "Toll-Free Verification does not carry over from one account to another."

> "Each of your customers should be mapped to an individual subaccount for their exclusive use."

> "For each subaccount, you should be using a single toll-free number per use case" (to avoid "snowshoeing").

The ISV support article (found via search snippet) adds:

> "For each of your submissions, you need to provide your end-business (not your own) information as part of the submission. Toll-free verifications with ISV info will be rejected."

> "For ISVs, the expectation is to identify and register the number for your customer — the entity crafting messages, and interacting with customers."

**Impact:** The spec's central premise ("one OSH-brand TFV covers all tenants") is directly contradicted by Twilio's documented policy. Submitting a TFV with OSH's own business info as a stand-in for downstream restaurants would be rejected.

### F2 — The compliant ISV pattern is subaccount-per-tenant

From the rearchitecture guide:

> Steps to become a compliant ISV:
> 1. Submit a support case to reclassify the parent account from "Direct Customer" to "ISV/Reseller".
> 2. Create one Twilio subaccount per end-customer.
> 3. Each subaccount gets its own Secondary Customer Profile, Brand registration, A2P/TFV registration, and phone numbers.
> 4. "A2P campaign registration does not carry over from one account to another" — same applies to TFV.

### F3 — The Compliance Embeddable is Twilio's blessed ISV onboarding UI

From the compliance-embeddable docs:

> "White-label embed offering designed to seamlessly integrate into an Independent Software Vendor's (ISV) existing portal or web application."

> "Enables your end customers to submit toll-free verification requests through self-service."

Capabilities:
- Renders as a React component or iframe inside OSH's onboarding wizard.
- Tenant fills in **their own** business info, opt-in evidence, sample messages.
- Progress auto-saves across browser sessions; can resume.
- Rejected verifications can be edited and resubmitted inline — no dev involvement.

**This is the lever that rescues self-serve onboarding.** Per-tenant TFV is still mandatory, but the tenant does the paperwork inside OSH's branded flow without needing to touch the Twilio console or email support.

### F4 — Voice numbers remain outside the TFV/10DLC regime

No change from the spec: a tenant who opts into IVR gets a dedicated voice long code provisioned in minutes, no carrier registration, $1/mo. Voice is not affected by any of F1–F3.

### F5 — Toll-Free Verification across subaccounts is queryable centrally (2024+)

From changelog:

> Customers can now retrieve all Subaccount verification records under a main account by using the `IncludeSubAccounts` parameter.

**Impact:** OSH can build a single admin surface showing TFV status of every tenant from the parent account, without per-subaccount auth. Simplifies operations.

## Design Impact

**The spec PR #70 is materially wrong on its central claim.** Correction required:

| Spec claim | Reality |
|---|---|
| "One OSH-brand TFV covers all tenants." | Each tenant needs their own TFV. |
| "New tenant SMS setup time: zero." | SMS setup is 1–3 week TFV approval **per tenant**, via self-service form. |
| "Zero per-tenant incremental cost for SMS." | ~$2/mo per tenant (subaccount toll-free number + TFV fees). |
| "Shared toll-free number across tenants." | Dedicated toll-free number per subaccount. |
| Onboarding wizard step: "SMS is ready" on day 0. | Onboarding wizard: "SMS submitted for verification — you'll be live in ~2 weeks. Web join + voice IVR work immediately." |

### What survives the correction

- **Per-tenant voice IVR numbers** are still instant and cheap — unchanged.
- **Display-name prefix, opt-out ledger, inbound routing logic** all still apply — but are now per-subaccount, not across-all-tenants-on-a-shared-number. The collision/disambiguation complexity (R6) goes away entirely because each tenant has its own number.
- **SKB's existing 10DLC long code** stays in place indefinitely (it's already approved); SKB's migration to the subaccount pattern is a separate cleanup issue.
- **Waitlist onboarding is not blocked by SMS approval.** Web-based join (QR, URL) and voice IVR are both live day-1 per tenant. SMS just lags.

### Simplified architecture (post-spike)

```
OSH parent account (Twilio, classified as ISV/Reseller)
  └── Subaccount: tenant SKB
  │     ├── Toll-free SMS number (TFV approved)
  │     └── Voice long code (optional)
  ├── Subaccount: tenant osh-demo-2
  │     ├── Toll-free SMS number (TFV pending → approved)
  │     └── Voice long code (optional)
  └── Subaccount: tenant N
        ├── Toll-free SMS number (TFV pending → approved)
        └── Voice long code (optional)
```

Onboarding flow per tenant:
1. Tenant signs up → OSH creates a Twilio subaccount for them via `twilio.api.accounts.create({friendlyName: tenant.slug})`.
2. OSH provisions a toll-free number into the subaccount immediately (status: unverified, can't send yet).
3. OSH shows the Compliance Embeddable in the onboarding wizard. Tenant fills in their business info, opt-in evidence, sample messages. Submits.
4. Tenant proceeds with the rest of setup (menu, staff, hours). Waitlist goes live for web/QR/voice join.
5. Twilio reviews TFV (~1–3 weeks). On approval, webhook fires; OSH flips the tenant's `smsReady = true`; table-ready SMS starts flowing.
6. During the verification wait, host-initiated SMS attempts are either (a) queued until approval, or (b) shown as "SMS unavailable — call guest at (phone)" prompts in the host UI.

### Risks and mitigations

- **Risk:** Tenant abandons during TFV form → no SMS ever. **Mitigation:** wizard surfaces TFV state prominently and reminds via email; embeddable's save/resume makes this recoverable.
- **Risk:** Tenant TFV rejected for content/opt-in reasons. **Mitigation:** embeddable allows inline edit + resubmit; OSH surfaces rejection reason in admin UI.
- **Risk:** Sid-the-operator gets a flood of TFV-approval webhook events as tenants onboard. **Mitigation:** F5 lets OSH poll `IncludeSubAccounts=true` on a schedule instead of per-subaccount auth; simpler.
- **Risk:** The "transitional shared-number" grey-area path is tempting but carrier-non-compliant. **Mitigation:** do not ship it; honest messaging during the TFV window is the right call.

## What still needs a live spike (deferred to implementation phase)

- Exact Twilio Node SDK call shape for:
  - `twilio.api.v2010.accounts.create({friendlyName})` — creating a subaccount from the parent.
  - `twilio.api.v2010.accounts(subaccountSid).incomingPhoneNumbers.create({phoneNumber})` — provisioning a toll-free into the subaccount.
  - `twilio.tollfreeVerifications.create({...})` — submitting TFV; confirm the Compliance Embeddable handles this transparently.
- Compliance Embeddable integration: React component vs. iframe; what OSH server needs to expose for the `Initialize API`.
- TFV approval webhook / Event Streams subscription shape.
- Cost confirmation: per-subaccount toll-free ~$2/mo; TFV submission fee structure (if any beyond number rental).

These are implementation-time concerns, not architecture-time concerns.

## Follow-up Spike — Framing B (OSH-as-direct-customer, Yelp pattern)

After initial findings (F1–F5) appeared to kill the shared-number path, a second pass targeted a distinct framing that the first pass conflated: **OSH as the legal sender** (like Yelp, DoorDash, Uber), with restaurants named only in message content.

### F6 — Twilio Messaging Policy defines "the sender" as "the party that obtained the consent"

From Twilio's Messaging Policy (twilio.com/en-us/legal/messaging-policy):

> "Every message that you send via the Twilio Messaging Services must clearly identify you (i.e., the party that obtained the consent from a recipient) as the sender."

**Impact:** "The sender" is a function of **who collected the consent**, not who is named in the body. If OSH's join form collects the phone number under OSH-named consent, OSH is the sender — even if the message body begins "Shri Krishna Bhavan: …".

### F7 — "Opt-in cannot be shared across businesses" is an anti-list-brokering rule

Same policy:

> "Any consent that you obtain from a recipient is strictly for the subject matter for which that recipient provided their consent."
>
> "Selling, Renting, or Transferring Consent Prohibited" — "Consent does not extend to any other recipient, individual, or party."

The prohibition is on **transferring** a consent from one business to another (i.e., list-selling). A single business (OSH) collecting many narrowly-scoped consents ("I agree to OSH texts about my wait at this restaurant") is not sharing consents — each consent is a fresh, scoped grant to OSH.

Subject-matter constraint: OSH may only text a given guest about the specific restaurant they joined. No cross-restaurant marketing. OSH's existing flow already satisfies this (no outbound unless triggered by a host action within that restaurant's queue).

### F8 — Existence proof: Yelp, DoorDash, Uber, Instacart all operate Framing B

These platforms have sustained single-sender architectures (mostly short codes, some toll-free) for years across carrier renewal cycles. If policy interpreted Framing B as non-compliant, these platforms could not exist in their current form. No reseller-ID-per-merchant, no per-restaurant TFV, no per-driver carrier registration.

Not a primary-source confirmation but a strong existence proof: the pattern is widely deployed and carrier-tolerated when the platform clearly owns the consent relationship.

### F9 — Framing B's TFV submission is straightforward

OSH files **one** TFV as a direct customer (not an ISV). Business fields are OSH's. Use case category: `ACCOUNT_NOTIFICATIONS`. Use case description: "Hospitality notification platform. Guests join restaurant waitlists via OSH-hosted forms at osh.example.com/r/<restaurant>. OSH sends notifications about wait status, table readiness, and two-way chat during the wait period. Messages identify the specific restaurant in content but OSH is the legal sender and consent-holder for all guests." Sample messages include the restaurant-name prefix format. Opt-in evidence is a screenshot of the join form showing the OSH-named consent disclosure.

### Framing A vs. Framing B — the actual design choice

| Axis | Framing A (ISV Reseller) | Framing B (Direct Customer / Yelp pattern) |
|---|---|---|
| Who is "the sender" | Each restaurant | OSH |
| Who owns guest relationship | Restaurant | OSH platform |
| TFV submissions required | One per tenant (self-service via Compliance Embeddable) | Exactly one, OSH's own, forever |
| New-tenant SMS activation | 1–3 week wait per tenant (their own TFV approval) | Instant — new tenants inherit OSH's existing verification |
| Per-tenant recurring cost | ~$2/mo (toll-free + subaccount) | $0 (shared number) |
| Per-tenant one-time friction | Owner fills TFV form inside OSH's onboarding wizard (~10 min) | None |
| Consent copy requirement | Names each restaurant (status quo) | Must name OSH as sender; restaurant named secondarily |
| Inbound routing | One number per tenant → trivial | Shared number → needs phone → active-queue-entry resolver (spec §6 R5 already designed) |
| Carrier-policy fit | Explicitly documented in Twilio's ISV guidance | Analogous to Yelp/DoorDash/Uber practice; defensible under messaging-policy reading, not called out by name in TFV docs |
| Risk of TFV rejection on submission | Low per-tenant (embeddable pre-validates fields) | Low-to-moderate: reviewer could press on multi-restaurant scenario. Mitigation: submit with explicit platform framing; fallback to A if denied. |
| Fits OSH product posture | Each restaurant is its own business with OSH as infrastructure (Waitwhile Enterprise model) | OSH is a platform; restaurants are partners surfaced in content (Yelp Waitlist model) |

### Recommendation from spike

**Framing B** is materially better on every operational axis (time-to-live, cost, complexity) and is carrier-defensible provided:
1. Consent copy on the join form explicitly names OSH as the sender.
2. OSH's privacy policy and Terms of Service make the OSH-guest relationship primary.
3. Messages only ever address the specific subject matter (the guest's wait at the restaurant they joined).
4. TFV submission describes OSH as a hospitality notification platform, not as a reseller of SMS infrastructure.

Framing A is the known-safe fallback if TFV submission under Framing B is denied. Even under A, the per-tenant friction is bounded (~10 min of form-filling) thanks to the Compliance Embeddable — it's not the original "dev-provisioned 10DLC" nightmare.

## Conclusion

**Spike result:** The initial framing of the spec was *under-specified* — "shared OSH toll-free" mapped to two distinct legal postures, one of which (A, ISV Reseller) is incompatible with a single verification, and one of which (B, Direct Customer / Yelp pattern) is compatible. The design choice is a business-posture call about who owns the guest relationship, not a pure technical call.

Recommended path: **Framing B** (single OSH TFV, shared toll-free, OSH-named consent), with Framing A (subaccount-per-tenant + Compliance Embeddable) as the documented fallback if TFV denies Framing B.

**Spike cost vs. implementation cost:** ~45 minutes of docs reading vs. the alternative of either shipping an architecturally-wrong design (spec v1) or over-engineering to the full subaccount pattern without realizing the simpler Yelp path was open. Canonical spike-first win.
