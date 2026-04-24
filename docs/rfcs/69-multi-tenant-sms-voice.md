# RFC — Multi-tenant SMS / voice for OSH (Issue #69)

**Status:** Draft
**Owner:** sid.mathur@gmail.com
**Spec:** [`docs/feature-specs/69-shared-sms-number-multitenant.md`](../feature-specs/69-shared-sms-number-multitenant.md) (PR #70)
**Spike findings:** [`spike/69-twilio-tfv-isv/FINDINGS.md`](../../spike/69-twilio-tfv-isv/FINDINGS.md)

---

## 1. Customer

Restaurant owners onboarding onto OSH who want guests to receive waitlist SMS on day 1, operators provisioning those tenants, and diners who receive the texts.

## 2. Customer problem being solved

Multi-tenant OSH has to text many restaurants' guests. The original spec assumed "one OSH TFV covers all tenants," but a Phase-3 spike showed that Twilio's ISV-Reseller path explicitly requires per-tenant verification. The spike also surfaced a second framing — OSH as the direct sender, restaurants as message content (the Yelp/DoorDash pattern) — which preserves the spec's original "instant onboarding, $0 per tenant" outcome if we commit to the right product posture.

This RFC picks between those two framings and locks the concrete implementation.

## 3. Recommended path — Framing B (OSH-as-sender)

OSH files **one** toll-free verification as a direct Twilio customer. All tenants send from that single verified number. Restaurants are named in every outbound's leading prefix ("Shri Krishna Bhavan: …") but OSH is the legal sender and the party that collected consent. Exact same outcome as the original spec's goal; now grounded in a carrier-defensible legal posture instead of a misread of ISV policy.

**Why this is the right call for OSH:**
- Matches how the product is already shaped. Guests land on OSH-hosted URLs (`/r/:loc/...`), consent flows through OSH infrastructure, phone numbers live in OSH's database, OSH is listed in the privacy policy. OSH already owns the guest relationship; Framing B just makes that explicit in consent copy.
- Matches the #51 product vision of OSH being "the operating system for a restaurant" — a platform surface in its own right, not just a white-label wrapper.
- Instant SMS for new tenants; `$0` per-tenant recurring; no per-tenant paperwork.
- The only Framing-B-specific cost is a small consent-copy change on the join form, which is landing as part of #51 anyway.

**Why Framing A is kept only as a fallback:**
If the TFV reviewer pushes back on Framing B's multi-restaurant scope (low-to-moderate risk, not zero), the fallback is **Framing A — subaccount-per-tenant + Compliance Embeddable + per-tenant TFV**. That's a ~10-minute self-service form per tenant and a 1–3 week wait. Still much better than "dev-provisioned per-tenant 10DLC" because the Compliance Embeddable handles the UX. A full description of the A path is in §11 for completeness.

### 3.1 Framing comparison (pros / cons)

| Axis | Framing B (recommended) | Framing A (fallback) |
|---|---|---|
| Who is the legal sender | OSH | Each restaurant |
| TFV submissions | 1, OSH's own | 1 per tenant |
| New-tenant SMS ready in | ~5 minutes (inherit existing TFV) | ~1–3 weeks (per-tenant TFV approval) |
| Per-tenant recurring cost | $0 | ~$2/mo (subaccount + TF number) |
| Per-tenant one-time friction | None | ~10 min embedded form |
| Twilio account shape | One OSH account, one shared TF number | OSH parent + subaccount per tenant |
| Inbound routing complexity | Shared number → active-queue-entry resolver + collision disambiguation | One number per subaccount → trivial routing |
| Consent copy | Names OSH as sender, restaurant as context | Names the restaurant as sender |
| Carrier-docs explicitness | Defensible by analogy (Yelp/DoorDash); not blessed by name in TFV docs | Explicitly described in Twilio ISV docs |
| Risk of rejection | Low–moderate (TFV reviewer interpretation) | Very low per tenant |
| Fits product posture | OSH as platform-brand (Yelp Waitlist-like) | OSH as infrastructure (Waitwhile Enterprise-like) |

## 4. User experience (Framing B)

### 4.1 Tenant onboarding (the improvement)

1. Owner signs up on `/signup`, fills in restaurant name, address, hours.
2. Onboarding wizard shows **"SMS is ready."** copy:
   > *"Your restaurant will send and receive texts from **(855) 555-0199** — a toll-free number shared by all restaurants on OSH. Guests will see your restaurant name at the top of every message: 'Shri Krishna Bhavan: Your table is ready…'. Want your own number later? You can add a dedicated SMS or voice number in Settings."*
3. Owner clicks "Send me a test text"; the platform sends the join-confirmation template with the restaurant's display-name prefix to the owner's own phone. Wizard step self-completes on `delivered` status callback.
4. Voice/IVR is a separate opt-in button in the wizard; provisions in ~5 minutes and is fully tenant-scoped. Unchanged from spec.

### 4.2 Diner consent (Framing-B requirement)

On every tenant's `/r/:loc/join` form, the phone-number field's helper text reads:

> *"By providing your number, you agree to receive SMS from **OSH** about your wait at [Restaurant Name], sent from (855) 555-0199. Msg & data rates may apply. Reply STOP to opt out, HELP for help."*

This names OSH as the sender in plain view. TFV evidence references this form.

### 4.3 Diner inbound flow

Unchanged from spec §5.3–5.6. Shared-number inbound lands on `POST /api/sms/inbound`, resolves the correct tenant by matching the sender's phone against active queue entries, falls back to a disambiguation prompt on collision, honors STOP/START/HELP at the platform level.

## 5. Technical details

### 5.1 Environment & Twilio account

- Single Twilio account, no subaccounts (Framing B).
- Purchase one toll-free number (area code 855 or 844) in the Twilio console.
- Submit TFV under OSH's business info, use case `ACCOUNT_NOTIFICATIONS`, use-case description explicitly describing the hospitality-platform pattern.
- Keep SKB's existing legacy long code (`TWILIO_PHONE_NUMBER`) as failover for 30 days post-TFV; then release.

### 5.2 Config & secrets

```
TWILIO_ACCOUNT_SID=<unchanged>
TWILIO_AUTH_TOKEN=<unchanged>
TWILIO_PHONE_NUMBER=<post-cutover: the new toll-free E.164>
TWILIO_PHONE_NUMBER_LEGACY=<pre-cutover value, optional, 30-day failover>
SKB_PUBLIC_BASE_URL=<unchanged>
```

### 5.3 Data model changes

```ts
// src/types/queue.ts — Location schema additions
interface Location {
  // existing fields...

  /** Display name prefixed onto every outbound SMS. Defaults to `name`. */
  smsSenderName?: string;

  /** Dedicated voice IVR number (E.164). Present iff voice is provisioned. */
  twilioVoiceNumber?: string;

  /** Twilio incoming-phone-number SID for admin reference. */
  twilioVoiceNumberSid?: string;
}
```

New collection `sms_opt_outs`:

```ts
interface SmsOptOut {
  phone: string;          // 10-digit, normalized
  optedOutAt: Date;
  lastSeenTenants: string[]; // informational only
}
```

New collection `sms_disambiguation_pending` (short-lived, for R6):

```ts
interface SmsDisambigPending {
  phone: string;           // 10-digit
  serviceDay: string;      // YYYY-MM-DD
  candidateLocationIds: string[];
  pendingMessage: string;
  createdAt: Date;         // TTL index, 4h
}
```

New collection `sms_disambiguation_cache` (slightly longer-lived):

```ts
interface SmsDisambigCache {
  phone: string;
  serviceDay: string;
  resolvedLocationId: string;
  resolvedAt: Date;        // TTL index, 8h
}
```

### 5.4 Routes / API surface

| Route | Method | Mount | Purpose |
|---|---|---|---|
| `/api/sms/inbound` | POST | tenant-global, `src/routes/sms.ts` | **NEW.** Shared-number inbound. Resolves tenant from `From` phone; handles STOP/START/HELP; routes to `appendInbound(resolvedLoc, ...)`. |
| `/r/:loc/api/sms/inbound` | POST | tenant-scoped, existing | **DEPRECATED** (kept for SKB legacy long code during failover window). |
| `/api/sms/status` | POST | tenant-global, existing | Unchanged. |
| `/r/:loc/api/voice/incoming` | POST | tenant-scoped, existing | Unchanged. |

### 5.5 Service-layer changes

**`src/services/sms.ts`**

`sendSms(to, body)` gains a `locationId` parameter (non-breaking default for legacy callers):

```ts
export async function sendSms(
  to: string,
  body: string,
  opts?: { locationId?: string }
): Promise<SmsSendResult>;
```

Before dispatch:
1. If `to` is in `sms_opt_outs`, log `sms.suppressed_opt_out` and return `{status: 'opted_out', successful: false}`.
2. If `opts.locationId` is provided, load the location and compute the display-name prefix. Prepend `${senderName}: ` to `body` if not already present.
3. Call `client.messages.create(...)` against the toll-free `from` number as today.

**`src/services/smsTemplates.ts`**

Remove the hardcoded `"SKB:"` prefix from every template. The prefix is now applied in `sendSms` based on the tenant. Templates become pure body text:

```ts
export function joinConfirmationMessage(code: string, statusUrl: string): string {
  return `You're on the list! Track your place in line here: ${statusUrl}. Code: ${code}`;
}
// ...same shape for the other templates.
```

**`src/services/chat.ts` — new resolver + updated appendInbound**

New function `resolveInboundTenant(fromPhone, serviceDay)`:

```ts
export async function resolveInboundTenant(
  fromPhone: string,
  serviceDay: string,
): Promise<
  | { kind: 'match'; locationId: string }
  | { kind: 'none' }
  | { kind: 'collision'; candidateLocationIds: string[] }
>;
```

Flow:
1. Check `sms_disambiguation_cache` — if cached, return `{kind: 'match'}`.
2. Query `queueEntries` across **all** locations for `{phone, serviceDay, state: active}`.
3. Zero matches → `{kind: 'none'}`.
4. One match → `{kind: 'match'}`.
5. Multiple matches → `{kind: 'collision'}`.

The existing `appendInbound` is unchanged internally; the new `/api/sms/inbound` handler calls `resolveInboundTenant` first and passes the resolved `locationId` in.

**`src/routes/sms.ts` — new tenant-agnostic router**

```ts
export function smsGlobalInboundRouter(): Router {
  const r = Router();
  r.post('/sms/inbound', validateTwilioSignature, async (req, res) => {
    const from = String(req.body?.From ?? '');
    const body = String(req.body?.Body ?? '');
    const sid  = String(req.body?.MessageSid ?? '');
    const normalized = normalizePhone(from);

    // 1. STOP / HELP / START handling (platform-level, before tenant resolution)
    if (matchesStop(body))    { await upsertOptOut(normalized); return res.type('text/xml').send(twimlEmpty()); }
    if (matchesStart(body))   { await removeOptOut(normalized); return res.type('text/xml').send(twimlEmpty()); }
    if (matchesHelp(body))    { return res.type('text/xml').send(twimlHelpReply()); }

    // 2. Pending disambiguation?
    const pending = await fetchDisambigPending(normalized);
    if (pending) {
      const resolved = fuzzyMatchLocationName(body, pending.candidateLocationIds);
      if (resolved) {
        await cacheDisambigResolution(normalized, resolved);
        await appendInbound(resolved, from, pending.pendingMessage, pending.originalSid);
        await appendInbound(resolved, from, body, sid);
        await clearDisambigPending(normalized);
        return res.type('text/xml').send(twimlEmpty());
      }
      return res.type('text/xml').send(twimlDisambigReprompt(pending.candidateLocationIds));
    }

    // 3. Standard resolution
    const outcome = await resolveInboundTenant(normalized, serviceDay());
    switch (outcome.kind) {
      case 'match':
        await appendInbound(outcome.locationId, from, body, sid);
        return res.type('text/xml').send(twimlEmpty());
      case 'collision':
        await createDisambigPending(normalized, outcome.candidateLocationIds, body, sid);
        return res.type('text/xml').send(twimlDisambigPrompt(outcome.candidateLocationIds));
      case 'none':
        // Unchanged behavior — log and no-op
        log.warn('sms.inbound.unmatched', { from: maskPhone(from) });
        return res.type('text/xml').send(twimlEmpty());
    }
  });
  return r;
}
```

Mounted in `src/mcp-server.ts` alongside the existing `smsStatusRouter()`.

### 5.6 UI changes

**Admin Settings → Messaging** (already mocked at `docs/feature-specs/mocks/69-admin-sms-settings.html`):
- New input: Sender display name (`smsSenderName`).
- Read-only card: shared toll-free sending number.
- Voice & IVR card: dedicated per-tenant call-in number + sample greeting + "test call" button (mock already reflects this).

**Join form (`/r/:loc/join`)**:
- Update consent disclosure copy near the phone field to explicitly name OSH as the sender. One HTML/template edit; no new component.

No other UI changes.

### 5.7 Failure modes & timeouts

| Scenario | Failure mode | Handling |
|---|---|---|
| Outbound to an opted-out phone | App-level suppression | Abort before `messages.create()`; log `sms.suppressed_opt_out` |
| Outbound while TFV pending | Twilio returns error code `30032` | Fail; staging should see this during TFV approval window; production cutover only after approval |
| Inbound for phone with 2+ active queue entries (different tenants) | Ambiguous tenant | Disambiguation flow (R6); cached for 8h after resolution |
| Inbound from phone that opted out | Still routable carrier-side; we ignore app-side | Log, no-op |
| Twilio signature validation fails | Reject with 403 | Existing `validateTwilioSignature` middleware |
| Twilio `statusCallback` indicates `failed`/`undelivered` | Outbound never landed | Logged via existing `smsStatusRouter`; alerts via KQL saved searches |
| Twilio API 5xx / timeout | Transient | `messages.create()` throws; caller logs and returns `{successful: false}` |

### 5.8 Telemetry

All structured-JSON log events already exist. New event names:
- `sms.suppressed_opt_out` (info)
- `sms.inbound.stop_received` / `.start_received` / `.help_responded`
- `sms.inbound.disambig_prompt_sent` / `.disambig_resolved` / `.disambig_timeout`

Existing KQL saved searches on `law-skb-prod` under "SKB SMS Monitoring" extend to cover the new events.

## 6. Confidence level

**75 / 100.**

What pushes it up from 50:
- The spike resolved both framings on primary sources, and Framing B is existence-proved by Yelp/DoorDash/Uber operating patterns.
- Inbound routing logic already exists in `appendInbound` — only the tenant-resolver layer is new.
- No net-new Twilio SDK integration; the SDK calls are the same `messages.create()` shape.
- Fallback (Framing A via Compliance Embeddable) is well-documented by Twilio and doesn't require a redesign.

What keeps it below 85:
- TFV reviewer interpretation for Framing B is not first-party-blessed. A denial on first submission is possible and forces the A-fallback rewrite.
- Collision rate in production (`phone × serviceDay × multi-tenant`) is unknown; low expected but not measured.
- The consent-copy change is a real product decision, not just an engineering change.

## 7. Validation plan

| User scenario | Expected outcome | Validation method |
|---|---|---|
| Owner completes onboarding, clicks "Send me a test text" | Test SMS arrives with display-name prefix; wizard self-completes on delivered | Manual staging (Sid's phone) |
| Guest joins waitlist at `skb`, host triggers first-call | SMS arrives prefixed "Shri Krishna Bhavan:", body matches template | Manual staging |
| Guest replies "running 5 late" | Reply lands in SKB host chat for that party | Manual staging + Mongo query |
| Guest on `skb` and `osh-demo-2` waitlists same day, replies to either | Disambiguation prompt; diner reply with restaurant name routes correctly; cached for 8h | Manual staging |
| Guest replies STOP | `sms_opt_outs` row created; next host-triggered SMS is suppressed and host sees opt-out banner | Manual staging |
| Guest replies START | `sms_opt_outs` row removed; next SMS sends | Manual staging |
| Guest replies HELP | Platform HELP reply sent; no thread side effects | Manual staging |
| Voice number provisioned for `osh-demo-2`, guest calls | Existing IVR flow from #31 answers with correct display name | Manual call from Sid's phone |
| Outbound to an opted-out phone | `sms.suppressed_opt_out` logged; no Twilio API call | Log inspection |
| Shared-number inbound from unknown phone | `sms.inbound.unmatched` logged; no reply | Log inspection |

## 8. Test matrix

**Unit** — (`tests/unit/`):
- `resolveInboundTenant` — match / none / collision / cache-hit / STOP-before-resolution short-circuit. Uses Mongo test harness (existing pattern).
- `buildOutboundBody` helper — ensures sender-name prefix is applied idempotently (no double-prefix on retries).
- `matchesStop / matchesStart / matchesHelp` regex helpers — variants of STOP/UNSUBSCRIBE/CANCEL and their non-matches.
- Opt-out check in `sendSms` — suppresses when `sms_opt_outs` row present.

**Integration** — (`tests/integration/`, mock Twilio SDK only):
- Inbound E2E path through the `POST /api/sms/inbound` handler: signature validation → resolver → `appendInbound` → correct tenant's `queue_messages`.
- Disambiguation flow: collision → prompt → follow-up → cache → subsequent-route-without-lookup.
- Opt-out E2E path: STOP inbound → `sms_opt_outs` upsert → outbound suppression.

**E2E** — (`tests/e2e/`, no mocking, at most 1 new):
- One end-to-end against a Twilio **test credentials** account (`magic` from/to numbers): join waitlist → first-call → assert delivered webhook received. Tests the full outbound path with signed status callback.

## 9. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| TFV rejection of Framing B multi-restaurant scope | Medium | Submit with clear platform framing; include Yelp-style language in use-case description. If denied, switch to Framing A per §11 (well-defined fallback, no code rewrite, just provisioning/onboarding surface changes). |
| Consent-copy update lags carrier submission | Low | Ship consent-copy change to staging before filing TFV; use staging screenshot as TFV opt-in evidence. |
| Inbound collision rate higher than expected | Low | R6 disambiguation flow handles it. If rate exceeds 5% of inbound volume, revisit (e.g., per-tenant number as a targeted upgrade for specific high-overlap tenants). |
| STOP propagation confuses operators ("why is my diner not getting SMS?") | Low–medium | Host UI shows opt-out banner on the party row; admin UI has an "opt-outs" view. |
| Legacy SKB long code cutover glitch | Low | 30-day failover window; monitor `sms.delivery_failed` rate; rollback criterion defined in spec §8. |
| Twilio SDK change or carrier policy change invalidates Framing B mid-lifecycle | Low long-term | Architecture allows retrofit to Framing A without breaking clients; subaccount migration is a parent-account operation documented by Twilio. |

## 10. Spike findings

### What was spiked

- Twilio TFV API + console onboarding docs.
- Twilio's "Toll-Free Verification for ISVs" article (snippet-confirmed; full page was gated).
- Twilio's "Direct Customer to ISV Rearchitecture Guide" blog post.
- Twilio Compliance Embeddable documentation.
- Twilio Messaging Policy.
- Subaccount-aware TFV retrieval changelog.
- Industry-validation read of Yelp/DoorDash/Uber/Instacart operating patterns (observational, not primary-source).

### Findings

1. Framing A (ISV Reseller, shared TFV for all tenants) is **incompatible** with Twilio policy. Verification submitted with ISV's own business info is explicitly rejected; per-tenant TFV is required.
2. The Compliance Embeddable is Twilio's blessed UX for Framing A — lets tenants self-submit inside OSH's onboarding wizard without touching the Twilio console.
3. Framing B (Direct Customer, OSH-as-sender) is **defensible** under Twilio's Messaging Policy, which defines "the sender" as "the party that obtained the consent." Widely deployed by analogous platforms (Yelp, DoorDash, etc.).
4. Voice is unaffected — per-tenant voice long codes remain fast and cheap.

Full details in `spike/69-twilio-tfv-isv/FINDINGS.md`.

### Design impact

- Original spec's "shared OSH toll-free" outcome is preserved — but via Framing B (direct customer with consent scoped to OSH), not Framing A (ISV with shared TFV).
- Spec §1, §5, §6, §7, §9, §12 need errata to correctly describe Framing B and document Framing A as fallback.
- RFC uses Framing B as primary implementation, A as fallback per §11.
- Inbound routing architecture (spec §6 R5) stays as designed — it's needed under B, trivialized under A.

## 11. Fallback — Framing A implementation (if TFV denies B)

Documented so the team doesn't have to re-spike if a reviewer pushes back on Framing B.

### 11.1 Account restructuring

- File support case with Twilio: "Reclassify parent account from Direct Customer to ISV/Reseller."
- Create a subaccount per tenant via `twilio.api.v2010.accounts.create({friendlyName: tenant.slug})`.
- Persist `tenant.twilioSubaccountSid` + `tenant.twilioSubaccountAuthToken` in the `Location` doc (encrypted or read from Key Vault).

### 11.2 Per-tenant number provisioning

- On tenant creation (or upgrade to Framing A): provision a toll-free number in the subaccount via `twilio.api.v2010.accounts(subaccountSid).incomingPhoneNumbers.create({phoneNumber, voiceUrl: ..., smsUrl: ...})`.
- Persist `tenant.twilioTollFreeNumber` + `tenant.twilioTollFreeNumberSid`.

### 11.3 Compliance Embeddable integration

- Server: expose `POST /api/admin/tfv/initialize` that calls Twilio's Initialize API with the tenant's subaccount credentials and returns the embed session token.
- Client: mount the Twilio Compliance Embeddable React component or iframe in the admin onboarding wizard.
- Webhook or polling: listen for TFV `status=TWILIO_APPROVED`; flip `tenant.smsReady = true`.

### 11.4 Messaging

- `sendSms(to, body, {locationId})` loads the tenant's subaccount credentials and sends from the tenant's toll-free number rather than the shared one.
- Inbound webhook per tenant: `POST /r/:loc/api/sms/inbound` (the existing route) — collision/disambiguation logic drops out since each tenant has its own number.

### 11.5 What stays the same

- Spec requirements on display-name prefix, opt-out ledger, voice-IVR opt-in, admin UI.
- All tests (they'd parameterize on number-per-tenant but the assertions are identical).
- Migration story for SKB (legacy long code stays until per-tenant TFV approves).

## 12. Observability

- All events prefixed `sms.` continue to flow to `law-skb-prod` via existing AppServiceConsoleLogs → KQL pipeline.
- New saved search: "TFV-denial inbound error codes" (Twilio 30032) on outbound attempts — fires during TFV pending and post-denial; surfaces in operator alerts.
- New saved search: "Disambiguation events" aggregating prompt/resolve/timeout rates to sanity-check the R6 flow isn't noisier than expected.
- Dashboard tile: opt-out ledger size over time.

## 13. Design standards

Generic UI baseline. Only UI surface is the admin Settings → Messaging panel (mocked) and a consent-copy tweak on the `/r/:loc/join` form. No net-new component library usage.

## 14. Help needed

- **User decision**: confirm Framing B is the chosen posture and that the consent-copy change on the join form is acceptable.
- **Twilio account**: file the TFV submission under Framing B; share the approved status before cutover. Sid-the-operator task.
- **Consent copy sign-off**: optionally run the new join-form disclosure by a TCPA-familiar attorney before shipping at scale. Low priority for the SKB+1-demo staging rollout; higher priority as tenant count grows.
