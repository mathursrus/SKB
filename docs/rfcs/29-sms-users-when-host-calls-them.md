# Feature: SMS Users When Host Calls Them

Issue: #29
Owner: Claude (AI Employee)

## Customer

Diners joining the SKB restaurant waitlist and hosts managing the queue.

## Customer Problem Being Solved

When a host clicks "Call", there is no external notification. Diners miss calls, leading to no-shows and wasted tables. See [feature spec](../feature-specs/29-sms-users-when-host-calls-them.md) for full problem statement.

## User Experience That Will Solve the Problem

1. Diner joins waitlist with full phone number (required) → receives confirmation SMS with status page link
2. Host clicks "Call" → diner receives SMS with table-ready message and call count
3. Host sees checkmark/X next to call label indicating SMS delivery status

Full UX flows and mocks in the [feature spec](../feature-specs/29-sms-users-when-host-calls-them.md#user-experience-that-will-solve-the-problem).

## Technical Details

### Architecture Overview

```mermaid
graph TD
    A[Diner Browser] -->|POST /queue/join| B[queue.ts route]
    B -->|joinQueue| C[queue.ts service]
    C -->|insert| D[(MongoDB)]
    C -->|fire-and-forget| E[sms.ts service]
    E -->|messages.create| F[Twilio API]
    F -->|sync response| E

    G[Host Browser] -->|POST /host/queue/:id/call| H[host.ts route]
    H -->|callParty| I[queue.ts service]
    I -->|update state| D
    H -->|sendCallSms| E
    E -->|{messageId, successful}| H
    H -->|{ok, smsStatus}| G
```

### New File: `src/services/sms.ts`

Provider-agnostic SMS service. Initial implementation uses Twilio; future migration to ACS tracked in #33.

```typescript
// src/services/sms.ts

import twilio from 'twilio';

interface SmsSendResult {
    messageId: string;
    status: string;
    successful: boolean;
}

interface SmsConfig {
    accountSid: string;
    authToken: string;
    fromNumber: string;
}

function getConfig(): SmsConfig | null {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromNumber) return null;
    return { accountSid, authToken, fromNumber };
}

export async function sendSms(to: string, body: string): Promise<SmsSendResult> {
    const config = getConfig();
    if (!config) {
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', msg: 'sms.not_configured' }));
        return { messageId: '', status: 'not_configured', successful: false };
    }

    const client = twilio(config.accountSid, config.authToken);
    try {
        const msg = await client.messages.create({
            from: config.fromNumber,
            to: `+1${to}`,  // prepend US country code
            body,
        });
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'sms.sent', to: maskPhone(to), messageId: msg.sid, status: msg.status }));
        return { messageId: msg.sid, status: msg.status, successful: true };
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'sms.failed', to: maskPhone(to), error: errMsg }));
        return { messageId: '', status: 'failed', successful: false };
    }
}

function maskPhone(phone: string): string {
    return '******' + phone.slice(-4);
}
```

### SMS Message Templates

```typescript
// src/services/smsTemplates.ts

export function joinConfirmationMessage(code: string, statusUrl: string): string {
    return `SKB: You're on the list! Track your place in line here: ${statusUrl}. Code: ${code}`;
}

export function firstCallMessage(code: string): string {
    return `SKB: Your table is ready! Please head to the front whenever you're ready. Show code ${code} to the host.`;
}

export function repeatCallMessage(code: string, callCount: number): string {
    return `SKB: Just a friendly reminder — we've called your name ${callCount} times. Your table is waiting for you! Code: ${code}.`;
}
```

### Data Model / Schema Changes

#### `QueueEntry` (src/types/queue.ts)

```diff
 export interface QueueEntry {
     locationId: string;
     code: string;
     name: string;
     partySize: number;
-    phoneLast4?: string;          // "1234"
+    phone: string;                // "2065551234" (10-digit US, required)
     state: PartyState;
     joinedAt: Date;
     promisedEtaAt: Date;
-    calls?: Date[];
+    calls?: CallRecord[];         // structured call records with SMS status
     // ... rest unchanged
 }

+export interface CallRecord {
+    at: Date;                     // when the host clicked Call
+    smsStatus: 'sent' | 'failed' | 'not_configured';
+    smsMessageId?: string;        // Twilio SID for debugging
+}
```

#### `JoinRequestDTO`

```diff
 export interface JoinRequestDTO {
     name: string;
     partySize: number;
-    phoneLast4?: string;
+    phone: string;                // required, 10 digits
 }
```

#### `HostPartyDTO`

```diff
 export interface HostPartyDTO {
     id: string;
     position: number;
     name: string;
     partySize: number;
-    phoneLast4: string | null;
+    phoneMasked: string;          // "******1234" — never expose full phone to frontend
     joinedAt: string;
     etaAt: string;
     waitingMinutes: number;
     state: 'waiting' | 'called';
-    callsMinutesAgo: number[];
+    calls: { minutesAgo: number; smsStatus: string }[];
 }
```

#### `StatusResponseDTO`

```diff
 export interface StatusResponseDTO {
     code: string;
     position: number;
     etaAt: string | null;
     etaMinutes: number | null;
     state: PartyState | 'not_found';
     callsMinutesAgo: number[];    // unchanged — no phone or SMS data in public response
 }
```

### API Surface Changes

#### `POST /r/:loc/api/queue/join` — Updated validation

```diff
 // queue.ts route — validateJoin()
-if (body.phoneLast4 !== undefined && body.phoneLast4 !== '') {
-    const p = String(body.phoneLast4);
-    if (!/^\d{4}$/.test(p)) {
-        return { error: 'phoneLast4 must be 4 digits', field: 'phoneLast4' };
-    }
-}
+const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
+if (!/^\d{10}$/.test(phone)) {
+    return { error: 'phone must be exactly 10 digits', field: 'phone' };
+}
```

After successful `joinQueue()`, fire confirmation SMS (non-blocking):

```typescript
// In queue.ts route, after joinQueue() returns:
const statusUrl = `${getBaseUrl(req)}/r/${loc(req)}/queue?code=${result.code}`;
sendSms(req.body.phone, joinConfirmationMessage(result.code, statusUrl))
    .catch(err => console.error('join SMS failed:', err));  // fire-and-forget
```

#### `POST /r/:loc/api/host/queue/:id/call` — Updated to include SMS

```diff
 r.post('/host/queue/:id/call', requireHost, async (req, res) => {
     const id = String(req.params.id);
     try {
-        const result = await callParty(id);
+        const result = await callParty(id);  // updates state + pushes CallRecord
         if (!result.ok) { res.status(404).json({ error: 'not found or not waiting' }); return; }
-        res.json({ ok: true });
+        res.json({ ok: true, smsStatus: result.smsStatus });
     } catch (err) { ... }
 });
```

#### `callParty()` service — Updated signature

```typescript
export async function callParty(
    id: string,
    now: Date = new Date(),
): Promise<{ ok: boolean; smsStatus: 'sent' | 'failed' | 'not_configured' }> {
    const db = await getDb();
    const _id = new ObjectId(id);

    // 1. Read the entry to get phone + code + call count
    const entry = await queueEntries(db).findOne({ _id, state: { $in: ACTIVE_STATES } });
    if (!entry) return { ok: false, smsStatus: 'not_configured' };

    // 2. Send SMS (sync — not fire-and-forget, because we need smsStatus)
    const callCount = (entry.calls?.length ?? 0) + 1;
    const message = callCount === 1
        ? firstCallMessage(entry.code)
        : repeatCallMessage(entry.code, callCount);
    const smsResult = await sendSms(entry.phone, message);

    // 3. Update state + push CallRecord (SMS failure does NOT block this)
    const callRecord: CallRecord = {
        at: now,
        smsStatus: smsResult.successful ? 'sent' : 'failed',
        smsMessageId: smsResult.messageId || undefined,
    };
    const res = await queueEntries(db).updateOne(
        { _id, state: { $in: ACTIVE_STATES } },
        { $set: { state: 'called' }, $push: { calls: callRecord } },
    );
    return { ok: res.matchedCount === 1, smsStatus: callRecord.smsStatus };
}
```

### UI Changes

#### `public/queue.html` + `public/queue.js` — Diner join form

| File | Change |
|------|--------|
| `queue.html` | Replace phone field: `<input type="tel" id="phone" required maxlength="10" placeholder="2065551234">` + helper text "We'll text you when your table is ready." |
| `queue.js` | Update `joinForm` submit: send `phone` instead of `phoneLast4`, validate 10 digits client-side |

#### `public/host.html` + `public/host.js` — Host dashboard

| File | Change |
|------|--------|
| `host.js` | Update `renderParty()`: display `phoneMasked` instead of `phoneLast4`, show checkmark/X after call based on `smsStatus` in API response |
| `host.js` | Update call button handler: read `smsStatus` from response, update UI indicator |

### Design Standards

Generic UI baseline. Mocks in `docs/feature-specs/mocks/` use existing SKB brand (Fira Sans, Black/White/Gold).

### Failure Modes & Timeouts

| Failure | Behavior | Timeout |
|---------|----------|---------|
| Twilio API down | `sendSms()` catches error, returns `{successful: false}`. Call proceeds. Host sees X. | Twilio SDK default (30s) — consider reducing to 5s |
| Twilio credentials missing | `getConfig()` returns null, SMS skipped silently. App works without SMS. | N/A |
| Invalid phone (bad data in DB) | Twilio throws 21211. Caught, logged, call proceeds. | N/A |
| MongoDB down | Existing 503 handling. SMS not sent (entry can't be read). | Existing |

### Telemetry & Analytics

All SMS events logged as structured JSON (existing pattern):

```
{ t, level: "info",  msg: "sms.sent",    to: "******1234", messageId: "SM...", status: "queued" }
{ t, level: "error", msg: "sms.failed",  to: "******1234", error: "..." }
{ t, level: "warn",  msg: "sms.not_configured" }
```

No new analytics endpoints. SMS delivery counts can be derived from existing structured logs.

## Confidence Level

**85/100**

High confidence because:
- Spike validated all SDK interactions with real Twilio test credentials
- Architecture is simple (no webhooks, no async, no new infrastructure)
- Changes are additive to existing patterns

Remaining 15% uncertainty:
- Real phone number provisioning (Twilio number purchase, 10DLC registration)
- Production SMS delivery latency under load
- Status URL format depends on deployment domain (needs env var or request-based detection)

## Validation Plan

| User Scenario | Expected Outcome | Validation Method |
|---------------|------------------|-------------------|
| Diner joins with valid phone | Entry created with `phone` field, confirmation SMS sent | API: POST /queue/join → 200, check DB for phone field |
| Diner joins with invalid phone | 400 error, entry not created | API: POST /queue/join with "abc" → 400 |
| Diner joins with empty phone | 400 error, entry not created | API: POST /queue/join with "" → 400 |
| Host calls party | State → called, SMS sent, smsStatus in response | API: POST /host/queue/:id/call → {ok: true, smsStatus: "sent"} |
| Host calls party (2nd time) | SMS includes "called 2 times", CallRecord pushed | API: call twice, verify calls[] has 2 records |
| Host calls, Twilio down | Call succeeds, smsStatus = "failed" | API: with invalid Twilio creds, call → {ok: true, smsStatus: "failed"} |
| Host calls, no Twilio config | Call succeeds, smsStatus = "not_configured" | API: unset TWILIO_* env vars, call → {ok: true, smsStatus: "not_configured"} |
| Host views queue | Phone masked as ******1234 | API: GET /host/queue → verify phoneMasked format |
| Diner checks status | No phone data in response | API: GET /queue/status → verify no phone field |
| Host sees SMS indicator | Checkmark for success, X for failure | Browser: click Call, verify icon appears |

## Test Matrix

### Unit Tests (mocking Twilio)

| Test Suite | What's Tested |
|-----------|---------------|
| `tests/unit/sms.test.ts` (NEW) | `sendSms()` success/failure/not-configured paths, phone masking, message template generation |
| `tests/unit/smsTemplates.test.ts` (NEW) | All 3 message templates with variable substitution |
| `tests/unit/queue.test.ts` (MODIFY) | Updated `joinQueue` tests for required `phone` field, `callParty` tests for CallRecord + smsStatus |

### Integration Tests (mock Twilio, real MongoDB)

| Test Suite | What's Tested |
|-----------|---------------|
| `tests/integration/queue.integration.test.ts` (MODIFY) | Join with phone, call with SMS status, host queue returns phoneMasked |
| `tests/integration/sms.integration.test.ts` (NEW) | Full join→call→verify-sms-status flow with mocked Twilio client |

### E2E Test (real Twilio test credentials, no mocking)

| Test Suite | What's Tested |
|-----------|---------------|
| `tests/e2e/sms-e2e.test.ts` (NEW) | Join → Call → verify Twilio test API accepted the message (using magic numbers) |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Twilio outage blocks all SMS | Low | Medium (calls still work, just no SMS) | `sendSms()` catches all errors; call always proceeds (R8) |
| 10DLC registration delay | Medium | High (can't send from unregistered number) | Use toll-free number initially; register 10DLC in parallel |
| SMS cost overrun | Low | Low (~$0.01/SMS) | Monitor via Twilio dashboard; cap at location level if needed |
| Phone number PII exposure | Low | High | Phone never in public APIs; masked in host API; PIN-gated access |
| calls[] schema migration | Low | Low | Additive change — old entries without calls[] still work (default to []) |

## Spike Findings

### What Was Spiked
Twilio Node.js SDK (`twilio` npm package) with test credentials and magic phone numbers.

### Findings
- `client.messages.create({from, to, body})` returns `{sid, status: "queued"}` **synchronously** — no need for webhooks or polling
- `status` from `create()` indicates accepted-by-carrier, sufficient for host UI checkmark/X
- Invalid numbers throw error code `21211` (status 400) — cleanly catchable in try/catch
- All 3 SMS templates (confirmation, first call, repeat call with URL) validated successfully
- Test credentials + magic numbers enable full E2E testing without real SMS costs
- `client.messages(sid).fetch()` not available with test credentials — confirms polling is unnecessary for our use case

### Design Impact
- **Simplified architecture**: No webhooks, no Event Grid, no polling infrastructure. Just `create()` + catch.
- **Provider-agnostic interface**: `{ messageId, status, successful }` works for both Twilio and ACS (#33)
- **Synchronous smsStatus**: `callParty()` returns `smsStatus` directly to the host API response, enabling immediate UI feedback
- **Timeout consideration**: Twilio SDK default timeout is 30s; recommend setting to 5s to avoid blocking the call API

## Architecture Analysis

### Patterns Correctly Followed
- **Structured JSON logging**: SMS events use the same `{ t, level, msg, ... }` pattern as existing `queue.remove`, `host.auth.fail` logs
- **Service layer separation**: New `sms.ts` service follows the existing pattern (`queue.ts`, `dining.ts`, `settings.ts`) — routes call services, services call DB
- **Multi-tenant scoping**: SMS is triggered per-entry which is already scoped to `locationId`
- **Error isolation in routes**: Existing `dbError()` pattern followed; SMS errors caught at service level, never bubble to 503
- **Environment variable config**: `TWILIO_*` vars follow existing `SKB_*`, `MONGODB_*` pattern with graceful fallback when missing
- **Type-safe DTOs**: New `CallRecord` and updated DTOs follow existing interface patterns in `types/queue.ts`

### Patterns Missing from Architecture (Need Documentation)
- **External service integration pattern**: This is the first external API call (Twilio). The codebase has no documented pattern for external service timeout, retry, or circuit-breaking. The RFC uses a simple try/catch with no retry, which is appropriate for SMS but should be documented as the baseline pattern.
- **Fire-and-forget vs synchronous external calls**: The RFC uses fire-and-forget for join SMS but synchronous for call SMS. This dual pattern should be documented.
- **PII handling pattern**: Phone number masking and access control rules aren't documented as an architectural pattern.

### Patterns Incorrectly Followed
- None identified. The design follows all existing codebase conventions.

## Observability (logs, metrics, alerts)

- **Structured JSON logs** (existing pattern): `sms.sent`, `sms.failed`, `sms.not_configured` events
- **No new metrics endpoints**: SMS counts derivable from logs
- **Alert recommendation**: Monitor `sms.failed` log frequency; alert if > 50% of SMS fail in a 10-minute window (indicates Twilio outage or credential issue)
- **Debug**: `smsMessageId` stored in CallRecord for Twilio dashboard cross-reference
