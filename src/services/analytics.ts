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

interface PhaseConfig {
    phase: string;
    label: string;
    startField: keyof QueueEntry;
    endField: keyof QueueEntry;
    requiredEndState?: string[]; // only include entries that reached at least this state
}

const PHASES: PhaseConfig[] = [
    { phase: 'wait', label: 'Wait Time (join → seated)', startField: 'joinedAt', endField: 'seatedAt' },
    { phase: 'order', label: 'Order Time (seated → ordered)', startField: 'seatedAt', endField: 'orderedAt' },
    { phase: 'kitchen', label: 'Kitchen Time (ordered → served)', startField: 'orderedAt', endField: 'servedAt' },
    { phase: 'eating', label: 'Eating Time (served → checkout)', startField: 'servedAt', endField: 'checkoutAt' },
    { phase: 'checkout', label: 'Checkout Time (checkout → departed)', startField: 'checkoutAt', endField: 'departedAt' },
    { phase: 'table', label: 'Total Table Occupancy (seated → departed)', startField: 'seatedAt', endField: 'departedAt' },
];

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
    const db = await getDb();
    const days = dateRangeToDays(rangeDays);
    const now = new Date();

    // Build list of serviceDays to query
    const serviceDays: string[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        serviceDays.push(serviceDay(d));
    }

    // Query all entries for the date range that have been seated (have lifecycle data)
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

    // Build histograms for each phase
    const histograms: PhaseHistogram[] = PHASES.map((cfg) => {
        const values: number[] = [];
        for (const d of filtered) {
            const start = d[cfg.startField] as Date | undefined;
            const end = d[cfg.endField] as Date | undefined;
            if (start && end) {
                values.push(minutesBetween(start, end));
            }
        }

        const avg = values.length > 0
            ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
            : null;

        return {
            phase: cfg.phase,
            label: cfg.label,
            buckets: buildHistogram(values),
            avg,
            total: values.length,
        };
    });

    let selectedRange: AnalyticsDTO['selectedRange'];
    if (startStage && endStage) {
        if (!isValidAnalyticsStagePair(startStage, endStage)) {
            throw new Error('invalid analytics stage range');
        }

        const startField = STAGE_FIELDS[startStage];
        const endField = STAGE_FIELDS[endStage];
        const values: number[] = [];
        for (const d of filtered) {
            const start = d[startField] as Date | undefined;
            const end = d[endField] as Date | undefined;
            if (start && end) {
                values.push(minutesBetween(start, end));
            }
        }

        const rangeHistogram: PhaseHistogram = {
            phase: `${startStage}-${endStage}`,
            label: `${buildRangeLabel(startStage, endStage)} Time`,
            buckets: buildHistogram(values),
            avg: values.length > 0
                ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
                : null,
            total: values.length,
        };
        histograms.unshift(rangeHistogram);
        selectedRange = {
            startStage,
            endStage,
            label: buildRangeLabel(startStage, endStage),
        };
    }

    const from = serviceDays[serviceDays.length - 1];
    const to = serviceDays[0];

    return {
        histograms,
        dateRange: { from, to },
        partySizeFilter,
        totalParties: filtered.length,
        selectedRange,
    };
}
