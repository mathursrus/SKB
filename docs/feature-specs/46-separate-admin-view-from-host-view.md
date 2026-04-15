# Feature Specification — Issue #46

**Title:** Separate Admin view from Host view
**Status:** Draft
**Owner:** sid.mathur@gmail.com
**Related issue:** https://github.com/mathursrus/SKB/issues/46
**Related mocks:** `docs/feature-specs/mocks/46-host-admin-split.html`

---

## 1. Why (Problem & Motivation)

Today the host-facing product asks one screen to do two jobs at once.

The current host stand page is optimized for live queue execution, but it also includes a mix of immediate service controls and broader operational management concerns such as:

- ETA mode and turn-time tuning in the top bar
- Today's stats in a collapsible card
- Visit Page configuration for the QR routing experience
- Broader phone / guest-entry system concerns that belong with admin configuration

This creates a blurred workflow. The host, who should focus on "the now," is forced to share screen space and attention with controls intended for broader operational oversight. At the same time, the operator or owner who wants the "bigger picture" has to enter through a page branded and structured as a host stand, then navigate out to analytics and settings that feel secondary.

Issue #46 asks for a clean differentiation:

- **Host** should be a fast operational surface for moving the line, seating parties, handling outreach, and monitoring immediate queue health.
- **Admin** should be the management surface for trends, configurable guest-entry channels, and broader operational settings that affect the system over hours or days, not the next 30 seconds.

This split should reduce host cognitive load, lower the chance of accidental settings edits during service, and make the product feel intentionally role-shaped rather than like a single page that kept accumulating controls.

### Goals

- **G1** Create a clearly distinct **Host view** optimized for immediate queue execution.
- **G2** Create a clearly distinct **Admin view** optimized for analytics and system configuration.
- **G3** Move admin-only controls out of the host workspace so the host focuses on current service, not system management.
- **G4** Preserve current system capabilities while reorganizing them into the right role surface.
- **G5** Keep the experience mobile-usable for host flows and tablet/desktop-usable for admin flows.

### Non-Goals

- Multi-user RBAC with separate credentials per employee is out of scope for v1.
- Financial reporting, payroll, and deep back-office functions are out of scope.
- Rebuilding analytics calculations or queue state models is out of scope.
- Replacing the current host PIN model is out of scope, though this spec introduces separate session destinations after authentication.

---

## 2. Who (User Profiles)

| Persona | Primary concern | Primary surface |
|---|---|---|
| **Host / front-desk operator** | "Who is next, who needs a message, and which table just opened?" | Host view |
| **Manager / owner / admin** | "How is service performing, what settings should we tune, and what should the QR flow do today?" | Admin view |
| **Cross-role operator** | "I sometimes host and sometimes manage" | Can switch between Host and Admin intentionally |

---

## 3. User Experience Summary

### 3.1 Role split

The product SHALL expose two distinct authenticated workspaces for a location:

- **Host**: live queue and dining operations
- **Admin**: analytics, guest-entry channel configuration, and location-level settings

Both remain behind the existing host-auth model in v1, but the app SHALL stop presenting admin controls as part of the main host workbench.

### 3.2 Host mental model: "run the floor"

The Host view is the page a front-desk operator can keep open all shift. It emphasizes:

- waiting count
- dining count
- oldest wait
- ETA mode and current turn-time control
- waiting / seated / complete tabs
- row actions such as seat, notify, call, chat, custom SMS, custom call, no-show
- timeline and seat dialog interactions already implemented

The Host view keeps the controls that directly influence the next estimate the host is quoting right now. It removes controls that govern broader channels and system behavior.

### 3.3 Admin mental model: "run the operation"

The Admin view is the page a manager opens to inspect patterns and tune behavior. It emphasizes:

- today's and historical performance
- analytics by date range, party size, and lifecycle stage range
- visit-page / QR behavior
- IVR / phone-system behavior
- location settings and service configuration

The Admin view should feel like a post-shift debrief and improvement workspace, not a live dispatch console.

### 3.4 Navigation model

After authentication, the user lands on the last-used workspace for that device, defaulting to **Host**.

Each workspace includes a clear, low-friction workspace switcher:

- In Host: a secondary action `Open Admin`
- In Admin: a secondary action `Back to Host`

The switch is intentional and explicit. Admin content should never appear inline on the Host page in collapsible cards.

---

## 4. What (Functional Requirements)

Requirements use SHALL-style language with `Rn` traceability tags.

### 4.1 Information architecture

- **R1** The system SHALL define two first-class authenticated location pages:
  - Host workspace at `/r/:loc/host.html`
  - Admin workspace at `/r/:loc/admin.html`
- **R2** The existing analytics page SHALL be absorbed into the Admin workspace rather than living as a separate destination from Host.
- **R3** The Host workspace SHALL contain only live-service operational controls and context needed during active service.
- **R4** The Admin workspace SHALL contain configuration, analytics, and operational review controls that are not required to seat or notify the next party or quote the next ETA.

### 4.2 Host workspace requirements

- **R5** The Host workspace SHALL preserve the current queue-operating functions:
  - waiting tab
  - seated tab
  - complete tab
  - ETA mode selector
  - manual turn-time input
  - row-level seat / notify / chat / call / custom SMS / custom call / no-show actions
  - seat dialog and dining timeline interactions
- **R6** The Host top bar SHALL keep live counters only: waiting, dining, and oldest wait.
- **R7** The Host workspace SHALL remove the following admin concerns from the main page body and top bar:
  - today's stats card
  - visit-page admin card
  - direct inline analytics surface
-  - IVR / phone-system configuration
- **R8** ETA mode and manual turn-time control SHALL remain visible and editable in Host because they directly affect live quoting and seating decisions.
- **R9** The Host workspace SHALL include one explicit secondary navigation action to the Admin workspace, labeled `Open Admin`.
- **R10** The Host workspace SHALL remain mobile-first and usable on a phone in portrait orientation for critical actions.
- **R11** Host actions that currently depend on settings maintained elsewhere SHALL continue to work without exposing those settings inline on the Host page.

### 4.3 Admin workspace requirements

- **R11** The Admin workspace SHALL aggregate the current admin-oriented surfaces into a single page with sections for:
  - service overview
  - live operational summary
  - guest-entry channel configuration
  - analytics charts and filters
- **R12** The Admin workspace SHALL surface the metrics currently shown in the Host stats card, because those are operational review metrics rather than moment-to-moment host controls.
- **R13** The Admin workspace SHALL surface the current analytics experience and extend it so admins can choose a lifecycle **start stage** and **end stage** for time-distribution analysis, alongside date range and party-size filters.
- **R14** The Admin workspace SHALL support stage-range analytics across the lifecycle data already present in the system, including at minimum flows such as joined → seated, seated → ordered, ordered → served, served → checkout, checkout → departed, and seated → departed.
- **R15** The Admin workspace SHALL surface the current visit-page configuration controls, including mode, menu URL, and closed message.
- **R16** The Admin workspace SHALL surface IVR / phone-system settings relevant to call-based waitlist entry and phone routing, including the settings already implied by the existing voice routes and location-level phone configuration.
- **R17** The Admin workspace SHALL NOT be the primary place for changing ETA mode or manual turn time; those stay in Host.
- **R18** The Admin workspace SHALL present these sections in descending decision horizon:
  - now: current counts and alerts
  - this shift: today's stats and live trends
  - tune guest-entry systems: visit-page / QR and IVR controls
  - historical analysis: analytics charts and stage distributions
- **R19** The Admin workspace SHALL include a clear action back to Host labeled `Back to Host`.
- **R20** The Admin workspace SHALL be optimized for tablet and desktop first, but remain functional on mobile without horizontal dead-ends.

### 4.4 Authentication and session behavior

- **R21** Both Host and Admin workspaces SHALL reuse the existing location PIN authentication model in v1.
- **R22** If an unauthenticated user opens either workspace, they SHALL see a login form branded for the requested destination, then return to that destination on success.
- **R23** The system SHALL remember the last-opened workspace per device and location, defaulting future successful logins to that workspace unless the user explicitly opened the other URL.
- **R24** Logging out from either workspace SHALL clear the shared authenticated session for both workspaces.

### 4.5 API and implementation boundaries

- **R25** Existing host APIs for queue, dining, completed, chat, call, seat, stats, analytics, settings, visit-config, and voice-related configuration SHALL remain available unless a route rename is necessary for clarity.
- **R26** The UI split SHOULD prefer reuse of the existing host/admin data endpoints rather than recalculating data client-side.
- **R27** If a new admin page is introduced, it SHALL consume current analytics, stats, visit-config, and voice-configuration endpoints or thin wrappers around them.
- **R28** The Host page SHALL not fetch admin-only data on initial load except what is required to render immediate queue operations and live ETA controls.

### 4.6 Safety and role clarity

- **R29** Configuration changes that affect guest-entry channels, such as visit-page mode or IVR behavior, SHALL only be editable from Admin.
- **R30** Host SHALL still reflect the effects of those settings, but SHALL not be the primary surface for changing them.
- **R31** Language and visual design SHALL reinforce the distinction:
  - Host uses execution-oriented copy such as `Seat`, `Notify`, `Call`, `Open Admin`
  - Admin uses management-oriented copy such as `Service Overview`, `Visit Page`, `IVR`, `Analytics`

---

## 5. Acceptance Criteria

- **AC-R1/R3**: Given a signed-in host opens the Host workspace, when the page loads, then they see live-service controls plus ETA mode and turn-time controls, but no collapsible admin cards for stats, visit-page configuration, or IVR configuration.
- **AC-R8/R19**: Given a signed-in user is on Host, when they tap `Open Admin`, then they land on the Admin workspace for the same location without re-authenticating.
- **AC-R13/R14/R15/R16**: Given a signed-in user is on Admin, when the page loads, then they can see today's stats, analytics filters, stage-range distribution controls, visit-page controls, and IVR-related configuration in one admin-oriented workspace.
- **AC-R14**: Given an admin chooses `start stage = ordered` and `end stage = served` with party size `3-4`, when analytics loads, then the page shows the time distribution for kitchen/service duration for that slice.
- **AC-R22**: Given an unauthenticated user opens `/r/skb/admin.html`, when they submit the correct PIN, then they are redirected into the Admin workspace rather than Host.
- **AC-R23**: Given a device last used Admin, when the user later authenticates from the neutral entry flow, then the app defaults them back into Admin until they intentionally switch again.
- **AC-R28**: Given a user opens Host on a phone during service, when the page initializes, then it does not block on analytics, visit-config, or IVR settings fetches before rendering the waitlist and live ETA controls.
- **AC-R29/R30**: Given a host wants to change visit-page routing or IVR behavior, when they are on Host, then there is no inline form to edit it; they must go to Admin.

---

## 6. Edge Cases

- If the device is frequently shared between host and manager roles, last-used workspace memory may bounce; explicit URLs still win over remembered defaults.
- If analytics has no data, Admin still renders the rest of the page with empty states rather than looking broken.
- If settings endpoints fail, Host continues to function for queue actions and retains the last-known ETA controls; Admin shows localized error states in the affected section.
- If a user opens Host on a tablet mounted at the stand, the `Open Admin` action remains available but visually secondary.
- If future RBAC is added, Admin sections can later be permission-gated without changing the page split introduced here.

---

## 7. Compliance Analysis

No additional regulatory regime is triggered by this issue beyond existing application constraints.

Relevant implications:

- **Operational safety**: Moving QR and IVR system configuration out of Host reduces the chance of accidental service-impacting changes in a customer-facing operational moment while preserving the host's ability to adjust live ETA assumptions.
- **Privacy**: No new customer data is introduced by this split.
- **Accessibility**: Both Host and Admin must preserve keyboard access, readable contrast, and mobile usability where applicable.

---

## 8. Competitive Analysis

This repo's configured competitors indicate a pattern already common in restaurant operations software: execution and management surfaces are separated even when they share auth.

| Competitor | Host / stand workflow | Admin / analytics workflow | Implication for SKB |
|---|---|---|---|
| **Yelp Guest Manager / Yelp Host** | Live waitlist and quote management stay with the stand operator | Reporting, trend review, and broader configuration live in separate management areas | SKB should match this separation without stripping Host of live ETA controls |
| **Waitwhile** | Check-in and live line management are task-focused | Analytics, settings, and flow tuning are positioned as dashboard/configuration experiences | Confirms the "now vs bigger picture" split in the issue statement |
| **NextMe** | Queue operations are lightweight and immediate | Broader management and reporting live outside the main stand workflow | Supports reducing clutter on Host |
| **Popmenu / Slang AI** | Frontline interactions are separated from system setup and automation tuning | Setup and reporting live in admin-style surfaces | Reinforces that configuration should not compete with service-time actions |

### Competitive takeaway

SKB already has the underlying pieces, but not the product separation. Implementing this issue closes a product-organization gap rather than adding net-new operational capability. The gain is clarity, safety, and perceived maturity.

---

## 9. Design Direction

No project-specific design system is configured in `fraim/config.json`, so this spec uses the existing visual language already present in the repo while clarifying role boundaries.

### Host view design principles

- Dense, high-signal, low-distraction
- Immediate metrics plus live ETA controls
- Larger emphasis on action rows and tab counts
- No accordion-like management panels competing for attention

### Admin view design principles

- Sectioned dashboard composition
- Strong hierarchy between "what happened", "what to change", and "how to improve future service"
- More breathing room, more explanatory labels, less row-action density
- Safe affordances for changing settings

---

## 10. UX Mock

High-fidelity HTML/CSS mock:

- `docs/feature-specs/mocks/46-host-admin-split.html` — side-by-side concept showing Host with live ETA controls and Admin with analytics, QR settings, and IVR/system controls.

The mock is the canonical visual reference for implementation direction.

---

## 11. Validation Plan

- Verify Host still supports the full critical waitlist path: join, notify, seat, dining transitions, call/chat, no-show.
- Verify Host can read and update ETA mode and manual turn time without leaving the live queue workspace.
- Verify Admin can read and update visit-page configuration and IVR/system settings without touching Host.
- Verify Admin analytics can slice by party size and by chosen lifecycle start/end stage.
- Verify analytics remains accessible from Admin and no longer needs to be entered through Host.
- Verify mobile Host usability on a portrait phone.
- Verify Admin remains readable on tablet and desktop, and functional on phone.
- Verify login redirect behavior for direct entry to Host vs Admin.

---

## 12. v1 Assumptions

1. The same authenticated session can access both workspaces.
2. "Admin" is a product/workspace distinction in v1, not a security-permission distinction.
3. Existing APIs for stats, analytics, visit config, and voice-related settings are sufficient or nearly sufficient to power the new Admin page with minimal server changes.
4. The current analytics page can be subsumed into Admin rather than maintained as a third top-level workspace.

---

## 13. Open Questions

- Should Admin also include location-management actions beyond what already exists, or should this issue stay strictly limited to relocating current admin-oriented controls?
- Should the login screen offer a visible `Enter Host` vs `Enter Admin` choice, or is direct URL entry plus remembered destination enough for v1?
- Should today's high-level stats appear nowhere on Host, or is a tiny read-only summary acceptable if it does not compete with the live queue?
- Which IVR settings should be editable in v1 of Admin: only location/front-desk routing details, or also script/flow behavior such as large-party transfer thresholds and fallback prompts?
- Should analytics continue to have its own URL under the hood and simply render inside Admin, or should it be fully reauthored as Admin sections from the start?