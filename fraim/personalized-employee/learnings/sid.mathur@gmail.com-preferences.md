# Preferences — sid.mathur@gmail.com

Durable record of this user's tastes, style, and default preferences. Entries below are confirmed and active guidance.

**Last synthesized**: 2026-04-27 (full corpus debrief)

---

## Confirmed entries

### [P-HIGH] Prefer simplicity and leverage existing resources (Azure credits, existing infra)

**Score**: 12.7
**Last seen**: 2026-04-08
**Recurrences**: 2
**First synthesized**: 2026-04-12

When presenting architecture choices, lead with the simplest viable option as the recommendation and frame more sophisticated paths as future upgrades — not as equal alternatives. This user consistently chooses the simplest approach that leverages existing resources (Azure credits, existing infrastructure, already-provisioned services) over a more sophisticated solution, even when the sophisticated option has technical advantages. Observed example patterns: (a) chose Twilio SMS synchronous-create-response over webhook-based delivery tracking when the synchronous response was sufficient, (b) chose polling-based delivery status over Event Grid webhooks to start with ACS, (c) explicit instruction "I like starting with simplicity and low cost". Do not present multi-option comparison tables when one option is clearly simpler-and-sufficient — present the simple one as the recommendation and the sophisticated one as a "we can revisit later" note.

---

### [P-MED] Default diner-facing copy to hospitality tone, not transactional/urgent

**Score**: 5.0
**Last seen**: 2026-04-08
**Recurrences**: 1
**First synthesized**: 2026-04-12

Customer-facing messages in the SKB system (SMS join confirmations, table-ready notifications, queue page copy, IVR prompts) should use a warm, polite hospitality voice — not a transactional or urgent system-alert tone. "Please come to the front now" is scolding; "Your table is ready — we'll see you soon" is hospitality. The user is a restaurant, not a pager service. Apply this default to all new diner-facing copy unless the user explicitly asks for a different tone.

---

### [P-MED] No call recording unless explicitly authorized — streaming STT only

**Score**: 5.0
**Last seen**: 2026-04-09
**Recurrences**: 1
**First synthesized**: 2026-04-12

Voice IVR flows must not record calls. Use streaming speech-to-text for name capture and other voice input. Do not include `record="record-from-answer"` or similar recording attributes in TwiML, and do not architect solutions that rely on stored audio. This is the owner's stated policy — privacy-first by default. If a design requires recording for any reason, flag it explicitly to the user before proceeding and expect pushback.

---

### [P-MED] Always offer a human fallback for edge cases automation can't handle

**Score**: 5.0
**Last seen**: 2026-04-09
**Recurrences**: 1
**First synthesized**: 2026-04-12

For any automated flow (IVR, queue join form, chat agent), provide a human fallback path for edge cases the automation can't handle: large parties that exceed the standard size, blocked Caller ID, speech recognition failure, non-English speakers, TCPA opt-outs that still want to join. Transfer to the front desk or present a clearly-marked alternative — never hang up on the caller or send the diner away with a generic error. This is a hospitality default for the SKB product and a general design principle for any Frontline-adjacent feature.

---

### [P-MED] Spec mocks are self-contained HTML with inline styles — openable in a browser, reviewable by a non-technical owner

**Score**: 5.0
**Last seen**: 2026-04-15
**Recurrences**: 1
**First synthesized**: 2026-04-27

When producing mocks during the feature-spec phase, write them as standalone HTML files with all styles inline so they can be opened directly in a browser by the restaurant owner without any build step or framework. The non-technical reviewer test applies: would the owner understand the feature by opening the HTML file alone? If they need to read code or run a dev server to see it, the mock is at the wrong abstraction level.

---

### [P-MED] Restaurant hours pages should embed a Google Maps card by default

**Score**: 3.0
**Last seen**: 2026-04-15
**Recurrences**: 1
**First synthesized**: 2026-04-27

Discoverability over payload weight. When a feature touches the public restaurant page (hours, location, contact), the default is to include a Google Maps embed for the address — not just a text address. Diners arriving via search expect the map to be inline, not a separate click.

---

### [P-MED] Spike the simplest viable thing first — don't design complex async paths when a sync API will do

**Score**: 5.0
**Last seen**: 2026-04-08
**Recurrences**: 1
**First synthesized**: 2026-04-12

When validating a technical approach, spike the simplest viable thing first before designing the more sophisticated alternative. Example: the Twilio SMS spike proved that the synchronous `create()` status response was sufficient for delivery tracking, eliminating the need for webhooks or polling altogether — a significant architectural simplification. The general rule: don't design a complex async path (webhooks, event queues, polling loops) until you've proven the simple synchronous path is insufficient. Start with the happy-path sync call, measure, and only add complexity when observed behavior demands it.
