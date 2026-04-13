// ============================================================================
// SKB - Settings service — multi-tenant
// ============================================================================
//
// Per-location ETA configuration. Two modes:
//   - 'manual'  (default): use the stored avgTurnTimeMinutes directly.
//   - 'dynamic': compute the median of the last N departed parties'
//                table-occupancy time (seatedAt → departedAt). Falls back
//                to the manual value when the sample is too small.
//
// The public getAvgTurnTime(locationId) getter keeps its historical
// signature — it now returns the *effective* minutes (dynamic if active
// and sufficient, else manual). All existing call sites keep working.
// ============================================================================

import { getDb, queueEntries, settings as settingsColl } from '../core/db/mongo.js';
import { minutesBetween } from '../core/utils/time.js';
import type { EtaMode, EffectiveTurnTime } from '../types/queue.js';

export const DEFAULT_AVG_TURN_TIME_MINUTES = 8;
export const MIN_AVG_TURN_TIME = 1;
export const MAX_AVG_TURN_TIME = 60;

export const DEFAULT_ETA_MODE: EtaMode = 'manual';
export const DYNAMIC_SAMPLE_WINDOW = 20;  // look at last N departed parties
export const MIN_DYNAMIC_SAMPLE = 5;      // below this, fall back to manual

// -- Pure helpers (exported for testing) -------------------------------------

/**
 * Median of an array of numbers. Returns 0 for empty input.
 * For even-length input, returns the mean of the two middle values.
 * Input is NOT mutated.
 */
export function medianMinutes(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

function isValidEtaMode(x: unknown): x is EtaMode {
    return x === 'manual' || x === 'dynamic';
}

// -- DB-backed functions -----------------------------------------------------

/**
 * Compute the dynamic turn time from the most recent departed parties.
 * Returns null when there's any sample; returns the median + sample size.
 * Caller is responsible for checking sampleSize >= MIN_DYNAMIC_SAMPLE.
 *
 * Filters to entries with state='departed' AND both seatedAt and departedAt
 * timestamps present, ordered by departedAt descending (most recent first).
 * Service-day agnostic — we want recent data even if it spans a boundary.
 */
export async function computeDynamicTurnTime(
    locationId: string,
): Promise<{ minutes: number; sampleSize: number } | null> {
    const db = await getDb();
    const docs = await queueEntries(db)
        .find({
            locationId,
            state: 'departed',
            seatedAt: { $exists: true },
            departedAt: { $exists: true },
        })
        .project<{ seatedAt: Date; departedAt: Date }>({ seatedAt: 1, departedAt: 1 })
        .sort({ departedAt: -1 })
        .limit(DYNAMIC_SAMPLE_WINDOW)
        .toArray();

    if (docs.length === 0) return null;

    const durations = docs.map((d) => minutesBetween(d.seatedAt, d.departedAt));
    const median = medianMinutes(durations);
    // Round to integer minutes; clamp to at least 1 so the ETA formula never yields 0.
    const minutes = Math.max(1, Math.round(median));
    return { minutes, sampleSize: docs.length };
}

/**
 * Resolve the effective turn time for a location, considering mode + fallback.
 * This is the authoritative getter used by the ETA formula throughout queue.ts.
 *
 * Always computes the dynamic value (even in manual mode) so callers — including
 * the host UI — can tell whether dynamic would currently be available and can
 * hide/disable the dynamic option when it isn't.
 */
export async function getEffectiveTurnTime(locationId: string): Promise<EffectiveTurnTime> {
    const db = await getDb();
    const doc = await settingsColl(db).findOne({ _id: locationId });
    const manualMinutes = doc?.avgTurnTimeMinutes ?? DEFAULT_AVG_TURN_TIME_MINUTES;
    const mode: EtaMode = (doc?.etaMode && isValidEtaMode(doc.etaMode)) ? doc.etaMode : DEFAULT_ETA_MODE;

    // Always compute dynamic so the UI knows whether the option is currently viable.
    const dynamic = await computeDynamicTurnTime(locationId);
    const sampleSize = dynamic?.sampleSize ?? 0;
    const dynamicAvailable = dynamic !== null && sampleSize >= MIN_DYNAMIC_SAMPLE;
    const dynamicMinutes = dynamicAvailable ? dynamic!.minutes : null;

    if (mode === 'dynamic' && dynamicAvailable) {
        return {
            effectiveMinutes: dynamic!.minutes,
            mode,
            manualMinutes,
            dynamicMinutes,
            sampleSize,
            fellBackToManual: false,
        };
    }

    // Either mode=manual OR mode=dynamic but sample is too small (fallback).
    return {
        effectiveMinutes: manualMinutes,
        mode,
        manualMinutes,
        dynamicMinutes,
        sampleSize,
        fellBackToManual: mode === 'dynamic' && !dynamicAvailable,
    };
}

/**
 * Backwards-compatible getter — returns the effective minutes only.
 * All existing call sites in queue.ts / stats.ts / routes continue to work.
 */
export async function getAvgTurnTime(locationId: string): Promise<number> {
    const info = await getEffectiveTurnTime(locationId);
    return info.effectiveMinutes;
}

/** Persist the manual value. Validation unchanged from the original implementation. */
export async function setAvgTurnTime(locationId: string, minutes: number): Promise<number> {
    if (
        !Number.isInteger(minutes) ||
        minutes < MIN_AVG_TURN_TIME ||
        minutes > MAX_AVG_TURN_TIME
    ) {
        throw new Error(
            `avgTurnTimeMinutes must be an integer in [${MIN_AVG_TURN_TIME}, ${MAX_AVG_TURN_TIME}]`,
        );
    }
    const db = await getDb();
    await settingsColl(db).updateOne(
        { _id: locationId },
        { $set: { _id: locationId, avgTurnTimeMinutes: minutes, updatedAt: new Date() } },
        { upsert: true },
    );
    return minutes;
}

/** Persist the ETA mode. Does not touch the manual value. */
export async function setEtaMode(locationId: string, mode: EtaMode): Promise<EtaMode> {
    if (!isValidEtaMode(mode)) {
        throw new Error(`etaMode must be 'manual' or 'dynamic'`);
    }
    const db = await getDb();
    await settingsColl(db).updateOne(
        { _id: locationId },
        { $set: { _id: locationId, etaMode: mode, updatedAt: new Date() } },
        { upsert: true },
    );
    return mode;
}
