# Implementation Work List: Dynamic ETA with Manual Override

**Issue:** dynamic-eta-with-manual-override (conversational feature request — feature #2 from the 2026-04-10 recommendation list; feature #1 was live-queue-auto-refresh, already shipped in commit `d831edb`)
**Type:** Feature
**Scope:** Server-side primary (settings + queue services) + host UI extension for the mode toggle

## Context

Today, the ETA quote on the queue page is computed as `position × avgTurnTimeMinutes`, where `avgTurnTimeMinutes` is a single manually-configured integer in the `settings` collection per location (`src/services/settings.ts:7`). The host types a number into the topbar input (`public/host.html:34-36`) and that number is used for every ETA promise thereafter. This has two problems:

1. **Static**: The number is never calibrated against reality. If the host set it to 8 but tonight's actual turn time is 14 minutes (big-party Saturday), every ETA is wrong by 75%. Diners told "24 min" who wait 42 min are furious.
2. **Stats visibility is one-directional**: The host stats card (`src/services/stats.ts:122`) already shows `configuredTurnTime` vs `actualTurnTime` ("Turn Time: Set vs Actual" in `public/host.html:65-67`) — so the host *sees* the gap but has no mechanism to close it except by manually tweaking the input.

We already capture `seatedAt` and `departedAt` timestamps on every queue entry (`src/types/queue.ts:37-41`, set by `src/services/dining.ts:80-96`). `computeAvgPhaseTime(entries, 'seatedAt', 'departedAt')` in `src/services/stats.ts:120` already computes the average table occupancy. **The data exists; we just need to feed it into the ETA formula and add a mode toggle so the host can choose.**

## Design (locked — bold defaults)

### Data model

Extend the `Settings` interface (`src/types/queue.ts:45-49`) with one new optional field:

```ts
export interface Settings {
    _id: string;                 // locationId
    avgTurnTimeMinutes: number;  // existing — the manual value (also the fallback for dynamic mode)
    etaMode?: EtaMode;           // NEW — 'manual' | 'dynamic', defaults to 'manual' when absent
    updatedAt: Date;
}
export type EtaMode = 'manual' | 'dynamic';
```

No migration needed — absent `etaMode` is treated as `'manual'` (existing behavior).

### Dynamic computation

New pure + async function pair in `src/services/settings.ts`:

```ts
// Tunables
export const DYNAMIC_SAMPLE_WINDOW = 20;   // last N departed parties
export const MIN_DYNAMIC_SAMPLE = 5;       // below this, fall back to manual
export const DEFAULT_ETA_MODE: EtaMode = 'manual';

// Pure — median of positive integer minutes
export function medianMinutes(values: number[]): number;

// DB-backed — returns null if insufficient sample
export async function computeDynamicTurnTime(locationId: string):
    Promise<{ minutes: number; sampleSize: number } | null>;

// DB-backed — returns full effective info object
export interface EffectiveTurnTime {
    effectiveMinutes: number;      // what the ETA formula actually uses
    mode: EtaMode;                 // what's configured (manual | dynamic)
    manualMinutes: number;         // the stored manual value (also the fallback)
    dynamicMinutes: number | null; // computed from data (null if mode=manual or sample too small)
    sampleSize: number;            // number of data points that fed the median
    fellBackToManual: boolean;     // true iff mode=dynamic but sampleSize < MIN_DYNAMIC_SAMPLE
}
export async function getEffectiveTurnTime(locationId: string): Promise<EffectiveTurnTime>;

// Keep backwards-compat signature — returns effectiveMinutes
export async function getAvgTurnTime(locationId: string): Promise<number>;

// NEW — persist mode
export async function setEtaMode(locationId: string, mode: EtaMode): Promise<EtaMode>;
```

**Why median instead of mean?** Restaurant tail is long — a single 3-hour anniversary dinner skews the mean. Median is robust to outliers and matches how the host mentally estimates "how long does a typical party take."

**Why window = 20 / min = 5?** 20 is a reasonable rolling sample for a restaurant doing 50–200 seatings a day (represents the most recent few hours during a rush). 5 is the absolute minimum for the median to be meaningful — below that, the manual value is a better guess than a 3-party median.

**Sample selection:** Last 20 parties with `state === 'departed'` AND both `seatedAt` and `departedAt` timestamps present, ordered by `departedAt` descending. Not filtered by service day — we want recent data even if it spans into the previous service day's last hour.

### API surface

**`GET /host/settings`** — extend the response:
```json
{
  "avgTurnTimeMinutes": 8,
  "etaMode": "dynamic",
  "effectiveMinutes": 11,
  "dynamicMinutes": 11,
  "sampleSize": 17,
  "fellBackToManual": false
}
```

Backwards-compat: the `avgTurnTimeMinutes` field stays at the top level so existing clients don't break.

**`POST /host/settings`** — accept partial updates. Body can include `avgTurnTimeMinutes`, `etaMode`, or both. Validate each independently.

### UI

**`public/host.html` topbar settings cell (`public/host.html:34-37`):**

Extend the "Avg turn time" cell into a compact mode-and-value pair:

```html
<div class="turn">
    <label class="turn-mode">
        ETA:
        <select id="eta-mode">
            <option value="manual">Manual</option>
            <option value="dynamic">Dynamic</option>
        </select>
    </label>
    <label>
        <span id="turn-label">min:</span>
        <input type="number" id="turn" min="1" max="60" value="8" />
    </label>
    <span id="turn-dynamic-info" class="turn-info" style="display:none"></span>
</div>
```

**`public/host.js` behavior:**
1. `refreshWaiting()` reads the settings from `/host/queue` response (which now includes the extended payload via `HostQueueDTO`). It updates both `turnInput.value` (to show the manual fallback) and the mode dropdown.
2. When mode = `dynamic` and a valid sample exists: show `turn-dynamic-info` with text like `"~11 min from 17 recent parties"`; input is still editable (it's the fallback) but shows a hint.
3. When mode = `dynamic` and sample < 5: show `"Using manual (not enough recent data)"`.
4. When mode = `manual`: hide the info span.
5. `onEtaModeChange` handler POSTs `{ etaMode }` to `/host/settings` and refreshes.
6. `onTurnChange` unchanged — continues to POST `{ avgTurnTimeMinutes }`.

### No breaking changes to public queue API

`GET /api/queue/state` and `GET /api/queue/status?code=` still return `avgTurnTimeMinutes` but the value returned is the **effective** minutes — diners don't see the manual/dynamic distinction. The field name is preserved for backwards compat; only the computation changes.

## Implementation Checklist

### Data model + service layer
- [ ] `src/types/queue.ts` — add `EtaMode` type, extend `Settings` interface with optional `etaMode`
- [ ] `src/services/settings.ts` — add constants (`DYNAMIC_SAMPLE_WINDOW`, `MIN_DYNAMIC_SAMPLE`, `DEFAULT_ETA_MODE`), `medianMinutes` pure helper, `computeDynamicTurnTime` db-backed function, `getEffectiveTurnTime` db-backed function, update `getAvgTurnTime` to delegate to `getEffectiveTurnTime`, add `setEtaMode`
- [ ] No changes to `src/services/queue.ts` — existing `getAvgTurnTime` call sites keep working because the signature is backwards-compatible

### Routes
- [ ] `src/routes/host.ts` — extend `GET /host/settings` to return full effective info, extend `POST /host/settings` to accept partial updates (`avgTurnTimeMinutes`, `etaMode`, or both)
- [ ] `src/routes/host.ts` — extend `GET /host/queue` response to include effective info alongside `avgTurnTimeMinutes` (or add it to `HostQueueDTO` so the UI gets it in one fetch without a second round-trip)

### UI
- [ ] `public/host.html` — extend topbar settings cell with mode dropdown + info span
- [ ] `public/host.js` — wire the dropdown, display dynamic info, POST mode changes
- [ ] `public/styles.css` — small visual additions for `.turn-mode`, `.turn-info`

### Tests
- [ ] `tests/unit/settings.test.ts` (new or existing) — unit test `medianMinutes` edge cases (empty → 0, 1 element, 2 elements even split, 5 elements, outlier robustness)
- [ ] `tests/integration/dynamic-eta.integration.test.ts` (new) — exercise the full path:
  - Settings start with no doc → `getEffectiveTurnTime` returns default 8, mode manual, sample 0
  - Set mode to dynamic with 0 departed parties → falls back to manual
  - Seat and depart 5 parties with varying durations → `getEffectiveTurnTime` returns median, mode dynamic, sample 5, `fellBackToManual` false
  - Set manual value → effective changes when mode is manual, unchanged when mode is dynamic
  - Queue `joinQueue` uses the effective value for the promised ETA (quote reflects dynamic median)
- [ ] E2E extension (`e2e/queue.e2e.test.ts`) — add one check: after 5 lifecycle completions, a new join with mode dynamic gets an ETA that reflects the dynamic median, not the default 8

### Manual validation
- [ ] Host UI: toggle mode, watch the info span appear/hide, confirm the manual input still posts correctly
- [ ] Queue page: after toggling to dynamic on a location with sufficient data, new joins get ETAs based on the computed value

## Validation Requirements

- `uiValidationRequired`: true (host topbar UI)
- `mobileValidationRequired`: false (host dashboard is desktop-primary)
- Browser baseline: Chrome desktop
- Test coverage: unit + integration + e2e

## Deferrals / Out of scope

- Day-of-week filtering (Monday lunch vs Saturday dinner patterns) — future refinement once the simple rolling median ships
- Party-size weighting — future refinement
- Hysteresis / smoothing — future refinement (for now, dynamic recomputes on every settings fetch)
- Cross-location baselines / cuisine-specific priors (the network-effect moat from the business plan) — separate feature, requires multi-tenant aggregation work
- Auto-switching between modes based on confidence — not in this iteration
