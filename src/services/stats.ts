// ============================================================================
// SKB - Stats service (end-of-day operations dashboard)
// ============================================================================
//
// Aggregates queue_entries for today's serviceDay to produce host-facing
// operational metrics: parties served, no-shows, avg wait, peak hour, and
// configured vs actual turn time.
// ============================================================================

import { getDb, queueEntries } from '../core/db/mongo.js';
import { getAvgTurnTime } from './settings.js';
import { serviceDay, minutesBetween, TZ } from '../core/utils/time.js';
import type { QueueEntry, HostStatsDTO, PartyState } from '../types/queue.js';

// -- Pure helpers (exported for testing) -------------------------------------

/** Format a 0-23 hour as "12 AM" / "12 PM" style label. */
export function formatHourLabel(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
}

/**
 * Compute average wait in minutes for parties that were seated.
 * Uses seatedAt if available (new lifecycle model), falls back to
 * removedAt for legacy entries where removedReason='seated'.
 */
export function computeAvgWait(
    entries: Pick<QueueEntry, 'joinedAt' | 'removedAt' | 'removedReason' | 'seatedAt'>[],
): number | null {
    const seated = entries.filter((e) => {
        // New model: has seatedAt
        if (e.seatedAt != null) return true;
        // Legacy model: removedReason='seated' with removedAt
        return e.removedReason === 'seated' && e.removedAt != null;
    });
    if (seated.length === 0) return null;
    const totalMinutes = seated.reduce((sum, e) => {
        const seatedTime = e.seatedAt ?? e.removedAt as Date;
        return sum + minutesBetween(e.joinedAt, seatedTime);
    }, 0);
    return Math.round(totalMinutes / seated.length);
}

/**
 * Compute average minutes between two lifecycle timestamps across entries.
 * Only counts entries where both timestamps are present.
 */
export function computeAvgPhaseTime(
    entries: Pick<QueueEntry, 'seatedAt' | 'orderedAt' | 'servedAt' | 'checkoutAt' | 'departedAt'>[],
    fromField: 'seatedAt' | 'orderedAt' | 'servedAt' | 'checkoutAt',
    toField: 'orderedAt' | 'servedAt' | 'checkoutAt' | 'departedAt',
): number | null {
    const valid = entries.filter((e) => e[fromField] != null && e[toField] != null);
    if (valid.length === 0) return null;
    const total = valid.reduce((sum, e) => {
        return sum + minutesBetween(e[fromField] as Date, e[toField] as Date);
    }, 0);
    return Math.round(total / valid.length);
}

/**
 * Find the peak hour (0-23) from joinedAt timestamps, using PT timezone.
 * Returns null if no entries. On tie, returns the earliest hour.
 */
export function computePeakHour(joinedAts: Date[]): number | null {
    if (joinedAts.length === 0) return null;
    const hourCounts = new Map<number, number>();
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour: 'numeric',
        hour12: false,
    });
    for (const d of joinedAts) {
        const hourStr = fmt.format(d);
        // Intl returns "24" for midnight in some locales; normalize to 0.
        const hour = parseInt(hourStr, 10) % 24;
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
    let peakHour = -1;
    let peakCount = 0;
    // Iterate 0..23 to guarantee earliest-wins on tie.
    for (let h = 0; h < 24; h++) {
        const count = hourCounts.get(h) ?? 0;
        if (count > peakCount) {
            peakCount = count;
            peakHour = h;
        }
    }
    return peakHour === -1 ? null : peakHour;
}

type StatsEntry = Pick<QueueEntry, 'state' | 'joinedAt' | 'removedAt' | 'removedReason' | 'seatedAt' | 'orderedAt' | 'servedAt' | 'checkoutAt' | 'departedAt'>;

/** Build a complete stats DTO from raw entries and the configured turn time. */
export function buildStats(
    entries: StatsEntry[],
    configuredTurnTime: number,
): HostStatsDTO {
    // "Seated" count: parties that went through seating (any post-seated state or departed).
    // Includes: seated, ordered, served, checkout, departed (but not no_show).
    const seatedStates: PartyState[] = ['seated', 'ordered', 'served', 'checkout', 'departed'];
    const partiesSeated = entries.filter((e) =>
        seatedStates.includes(e.state as PartyState) || e.removedReason === 'seated',
    ).length;
    const noShows = entries.filter((e) => e.removedReason === 'no_show' || e.state === 'no_show').length;
    const stillWaiting = entries.filter((e) =>
        (e.state === 'waiting' || e.state === 'called'),
    ).length;

    const avgActualWaitMinutes = computeAvgWait(entries);
    const peakHour = computePeakHour(entries.map((e) => e.joinedAt));

    // Lifecycle phase metrics
    const avgOrderTimeMinutes = computeAvgPhaseTime(entries, 'seatedAt', 'orderedAt');
    const avgServeTimeMinutes = computeAvgPhaseTime(entries, 'orderedAt', 'servedAt');
    const avgCheckoutTimeMinutes = computeAvgPhaseTime(entries, 'checkoutAt', 'departedAt');
    const avgTableOccupancyMinutes = computeAvgPhaseTime(entries, 'seatedAt', 'departedAt');

    return {
        partiesSeated,
        noShows,
        avgActualWaitMinutes,
        peakHour,
        peakHourLabel: peakHour != null ? formatHourLabel(peakHour) : null,
        configuredTurnTime,
        actualTurnTime: avgActualWaitMinutes, // same metric: avg wait for seated
        totalJoined: entries.length,
        stillWaiting,
        avgOrderTimeMinutes,
        avgServeTimeMinutes,
        avgCheckoutTimeMinutes,
        avgTableOccupancyMinutes,
    };
}

// -- Persistence (DB-backed) -------------------------------------------------

export async function getHostStats(now: Date = new Date()): Promise<HostStatsDTO> {
    const db = await getDb();
    const today = serviceDay(now);
    const configuredTurnTime = await getAvgTurnTime();

    const entries = await queueEntries(db)
        .find({ serviceDay: today })
        .project<StatsEntry>({
            state: 1,
            joinedAt: 1,
            removedAt: 1,
            removedReason: 1,
            seatedAt: 1,
            orderedAt: 1,
            servedAt: 1,
            checkoutAt: 1,
            departedAt: 1,
        })
        .toArray();

    return buildStats(entries, configuredTurnTime);
}
