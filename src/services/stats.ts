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
import type { QueueEntry, HostStatsDTO } from '../types/queue.js';

// -- Pure helpers (exported for testing) -------------------------------------

/** Format a 0-23 hour as "12 AM" / "12 PM" style label. */
export function formatHourLabel(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
}

/**
 * Compute average wait in minutes for seated entries that have both
 * joinedAt and removedAt. Returns null if no valid entries.
 */
export function computeAvgWait(
    entries: Pick<QueueEntry, 'joinedAt' | 'removedAt' | 'removedReason'>[],
): number | null {
    const seated = entries.filter(
        (e) => e.removedReason === 'seated' && e.removedAt != null,
    );
    if (seated.length === 0) return null;
    const totalMinutes = seated.reduce(
        (sum, e) => sum + minutesBetween(e.joinedAt, e.removedAt as Date),
        0,
    );
    return Math.round(totalMinutes / seated.length);
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

/** Build a complete stats DTO from raw entries and the configured turn time. */
export function buildStats(
    entries: Pick<QueueEntry, 'state' | 'joinedAt' | 'removedAt' | 'removedReason'>[],
    configuredTurnTime: number,
): HostStatsDTO {
    const partiesSeated = entries.filter((e) => e.removedReason === 'seated').length;
    const noShows = entries.filter((e) => e.removedReason === 'no_show').length;
    const stillWaiting = entries.filter((e) =>
        (e.state === 'waiting' || e.state === 'called'),
    ).length;

    const avgActualWaitMinutes = computeAvgWait(entries);
    const peakHour = computePeakHour(entries.map((e) => e.joinedAt));

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
    };
}

// -- Persistence (DB-backed) -------------------------------------------------

export async function getHostStats(now: Date = new Date()): Promise<HostStatsDTO> {
    const db = await getDb();
    const today = serviceDay(now);
    const configuredTurnTime = await getAvgTurnTime();

    const entries = await queueEntries(db)
        .find({ serviceDay: today })
        .project<Pick<QueueEntry, 'state' | 'joinedAt' | 'removedAt' | 'removedReason'>>({
            state: 1,
            joinedAt: 1,
            removedAt: 1,
            removedReason: 1,
        })
        .toArray();

    return buildStats(entries, configuredTurnTime);
}
