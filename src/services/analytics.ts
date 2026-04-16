// ============================================================================
// SKB - Analytics service (time distribution histograms)
// ============================================================================

import { getDb, queueEntries } from '../core/db/mongo.js';
import { minutesBetween, serviceDay } from '../core/utils/time.js';
import type {
    AnalyticsStage,
    AnalyticsDTO,
    HistogramBucket,
    PhaseHistogram,
    QueueEntry,
} from '../types/queue.js';

const BUCKET_SIZE_MINUTES = 5;
const MAX_BUCKET_MINUTES = 120; // 2h cap

// Default stage pair when the admin UI first loads — full lifecycle from
// the moment a party joined the waitlist to the moment they paid. This is
// what the owner actually wants to see on page load (issue #50 follow-up).
const DEFAULT_START_STAGE: AnalyticsStage = 'joined';
const DEFAULT_END_STAGE: AnalyticsStage = 'checkout';

const ANALYTICS_STAGE_ORDER: AnalyticsStage[] = ['joined', 'seated', 'ordered', 'served', 'checkout', 'departed'];

const STAGE_FIELDS: Record<AnalyticsStage, keyof QueueEntry> = {
    joined: 'joinedAt',
    seated: 'seatedAt',
    ordered: 'orderedAt',
    served: 'servedAt',
    checkout: 'checkoutAt',
    departed: 'departedAt',
};

export function isValidAnalyticsStagePair(startStage: AnalyticsStage, endStage: AnalyticsStage): boolean {
    const startIdx = ANALYTICS_STAGE_ORDER.indexOf(startStage);
    const endIdx = ANALYTICS_STAGE_ORDER.indexOf(endStage);
    return startIdx >= 0 && endIdx >= 0 && endIdx > startIdx;
}

function stageTitle(stage: AnalyticsStage): string {
    return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function buildRangeLabel(startStage: AnalyticsStage, endStage: AnalyticsStage): string {
    return `${stageTitle(startStage)} -> ${stageTitle(endStage)}`;
}

function partySizeBucket(size: number): string {
    if (size <= 2) return '1-2';
    if (size <= 4) return '3-4';
    return '5+';
}

function dateRangeToDays(range: string): number {
    switch (range) {
        case '1': return 1;
        case '7': return 7;
        case '30': return 30;
        default: return 7;
    }
}

/** Build histogram buckets from an array of minute values. */
export function buildHistogram(values: number[]): HistogramBucket[] {
    if (values.length === 0) return [];

    const maxVal = Math.min(Math.max(...values), MAX_BUCKET_MINUTES);
    const numBuckets = Math.ceil(maxVal / BUCKET_SIZE_MINUTES) + 1;
    const buckets: HistogramBucket[] = [];

    for (let i = 0; i < numBuckets; i++) {
        const min = i * BUCKET_SIZE_MINUTES;
        const max = min + BUCKET_SIZE_MINUTES;
        const label = max > MAX_BUCKET_MINUTES ? `${min}m+` : `${min}-${max}m`;
        buckets.push({ minMinutes: min, maxMinutes: max, label, count: 0, probability: 0 });
    }

    for (const v of values) {
        const idx = Math.min(Math.floor(v / BUCKET_SIZE_MINUTES), numBuckets - 1);
        buckets[idx].count++;
    }

    const total = values.length;
    for (const b of buckets) {
        b.probability = total > 0 ? Math.round((b.count / total) * 1000) / 1000 : 0;
    }

    return buckets;
}

export async function getAnalytics(
    locationId: string,
    rangeDays: string = '7',
    partySizeFilter: string = 'all',
    startStage?: AnalyticsStage,
    endStage?: AnalyticsStage,
): Promise<AnalyticsDTO> {
    // Default to the full-lifecycle pair when either side is unset. This lets
    // the admin UI open with a meaningful chart on page load and keeps legacy
    // callers (which didn't pass stage params at all) working.
    const effectiveStart: AnalyticsStage = startStage ?? DEFAULT_START_STAGE;
    const effectiveEnd: AnalyticsStage = endStage ?? DEFAULT_END_STAGE;
    if (!isValidAnalyticsStagePair(effectiveStart, effectiveEnd)) {
        throw new Error('invalid analytics stage range');
    }

    const db = await getDb();
    const days = dateRangeToDays(rangeDays);
    const now = new Date();

    // Build list of serviceDays to query
    const serviceDays: string[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        serviceDays.push(serviceDay(d));
    }

    // Query all entries for the date range that have lifecycle data. The
    // minimum bar for "participates in analytics at all" is that they were
    // at least seated — everything earlier (just joined) doesn't have a
    // meaningful time range to measure.
    const filter: Record<string, unknown> = {
        locationId,
        serviceDay: { $in: serviceDays },
        seatedAt: { $exists: true, $ne: null },
    };

    const docs = await queueEntries(db)
        .find(filter)
        .sort({ joinedAt: 1 })
        .toArray();

    // Apply party-size filter client-side
    const filtered = partySizeFilter === 'all'
        ? docs
        : docs.filter((d) => partySizeBucket(d.partySize) === partySizeFilter);

    // Build one histogram for the selected stage pair.
    const startField = STAGE_FIELDS[effectiveStart];
    const endField = STAGE_FIELDS[effectiveEnd];
    const values: number[] = [];
    for (const d of filtered) {
        const start = d[startField] as Date | undefined;
        const end = d[endField] as Date | undefined;
        if (start && end) {
            values.push(minutesBetween(start, end));
        }
    }

    const rangeHistogram: PhaseHistogram = {
        phase: `${effectiveStart}-${effectiveEnd}`,
        label: `${buildRangeLabel(effectiveStart, effectiveEnd)} Time`,
        buckets: buildHistogram(values),
        avg: values.length > 0
            ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
            : null,
        total: values.length,
    };

    const from = serviceDays[serviceDays.length - 1];
    const to = serviceDays[0];

    return {
        histograms: [rangeHistogram],
        dateRange: { from, to },
        partySizeFilter,
        totalParties: filtered.length,
        selectedRange: {
            startStage: effectiveStart,
            endStage: effectiveEnd,
            label: buildRangeLabel(effectiveStart, effectiveEnd),
        },
    };
}
