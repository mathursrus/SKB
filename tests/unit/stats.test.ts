// Unit tests for pure helpers in src/services/stats.ts
import { runTests } from '../test-utils.js';
import {
    computeAvgWait,
    computeAvgPhaseTime,
    computePeakHour,
    buildStats,
    formatHourLabel,
} from '../../src/services/stats.js';
import type { QueueEntry } from '../../src/types/queue.js';

type Entry = Pick<QueueEntry, 'state' | 'joinedAt' | 'removedAt' | 'removedReason' | 'seatedAt' | 'orderedAt' | 'servedAt' | 'checkoutAt' | 'departedAt'>;

interface T {
    name: string;
    description?: string;
    tags?: string[];
    testFn?: () => Promise<boolean>;
}

// Helper: create a Date at a specific PT hour on a fixed day.
// We use UTC offsets so tests are deterministic regardless of host TZ.
// PT is UTC-7 during PDT, so 12 PM PT = 19:00 UTC.
function ptDate(hour: number, minute: number = 0): Date {
    // 2026-04-04 is in PDT (UTC-7)
    return new Date(Date.UTC(2026, 3, 4, hour + 7, minute, 0));
}

function makeEntry(
    overrides: Partial<Entry> & { joinedAtHour?: number; removedAtHour?: number },
): Entry {
    const joinedAt = overrides.joinedAt ?? ptDate(overrides.joinedAtHour ?? 12, 0);
    const removedAt = overrides.removedAt ?? (overrides.removedAtHour != null
        ? ptDate(overrides.removedAtHour, 0)
        : undefined);
    return {
        state: overrides.state ?? 'seated',
        joinedAt,
        removedAt,
        removedReason: overrides.removedReason ?? 'seated',
        seatedAt: overrides.seatedAt,
        orderedAt: overrides.orderedAt,
        servedAt: overrides.servedAt,
        checkoutAt: overrides.checkoutAt,
        departedAt: overrides.departedAt,
    };
}

const cases: T[] = [
    // --- formatHourLabel ---
    {
        name: 'formatHourLabel: midnight => "12 AM"',
        tags: ['unit', 'stats'],
        testFn: async () => formatHourLabel(0) === '12 AM',
    },
    {
        name: 'formatHourLabel: 9 => "9 AM"',
        tags: ['unit', 'stats'],
        testFn: async () => formatHourLabel(9) === '9 AM',
    },
    {
        name: 'formatHourLabel: 12 => "12 PM"',
        tags: ['unit', 'stats'],
        testFn: async () => formatHourLabel(12) === '12 PM',
    },
    {
        name: 'formatHourLabel: 15 => "3 PM"',
        tags: ['unit', 'stats'],
        testFn: async () => formatHourLabel(15) === '3 PM',
    },

    // --- computeAvgWait ---
    {
        name: 'computeAvgWait: empty array => null',
        tags: ['unit', 'stats'],
        testFn: async () => computeAvgWait([]) === null,
    },
    {
        name: 'computeAvgWait: only no-shows => null',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const entries = [
                makeEntry({ removedReason: 'no_show', joinedAtHour: 12, removedAtHour: 13 }),
            ];
            return computeAvgWait(entries) === null;
        },
    },
    {
        name: 'computeAvgWait: single seated party with 10m wait => 10',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const entries = [
                makeEntry({
                    removedReason: 'seated',
                    joinedAt: ptDate(12, 0),
                    removedAt: ptDate(12, 10),
                }),
            ];
            return computeAvgWait(entries) === 10;
        },
    },
    {
        name: 'computeAvgWait: three seated parties (10m, 14m, 12m) => 12 (AC-R4)',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const entries = [
                makeEntry({ joinedAt: ptDate(12, 0), removedAt: ptDate(12, 10) }),
                makeEntry({ joinedAt: ptDate(12, 5), removedAt: ptDate(12, 19) }),
                makeEntry({ joinedAt: ptDate(12, 10), removedAt: ptDate(12, 22) }),
            ];
            return computeAvgWait(entries) === 12;
        },
    },
    {
        name: 'computeAvgWait: skips entry with missing removedAt',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const entries = [
                makeEntry({ joinedAt: ptDate(12, 0), removedAt: ptDate(12, 10) }),
                makeEntry({ joinedAt: ptDate(12, 5), removedAt: undefined }),
            ];
            return computeAvgWait(entries) === 10;
        },
    },

    // --- computePeakHour ---
    {
        name: 'computePeakHour: empty => null',
        tags: ['unit', 'stats'],
        testFn: async () => computePeakHour([]) === null,
    },
    {
        name: 'computePeakHour: single entry at 12 PM PT => 12',
        tags: ['unit', 'stats'],
        testFn: async () => computePeakHour([ptDate(12, 30)]) === 12,
    },
    {
        name: 'computePeakHour: 2 at 11AM, 3 at 12PM, 1 at 1PM => 12 (AC-R5)',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const dates = [
                ptDate(11, 0), ptDate(11, 30),
                ptDate(12, 0), ptDate(12, 15), ptDate(12, 45),
                ptDate(13, 0),
            ];
            return computePeakHour(dates) === 12;
        },
    },
    {
        name: 'computePeakHour: tie => earliest hour wins (AC-R10)',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const dates = [
                ptDate(11, 0), ptDate(11, 30), ptDate(11, 45),
                ptDate(14, 0), ptDate(14, 15), ptDate(14, 30),
            ];
            return computePeakHour(dates) === 11;
        },
    },

    // --- buildStats ---
    {
        name: 'buildStats: empty day => all zeros/nulls (AC-R9)',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const stats = buildStats([], 8);
            return (
                stats.partiesSeated === 0 &&
                stats.noShows === 0 &&
                stats.avgActualWaitMinutes === null &&
                stats.peakHour === null &&
                stats.peakHourLabel === null &&
                stats.configuredTurnTime === 8 &&
                stats.actualTurnTime === null &&
                stats.totalJoined === 0 &&
                stats.stillWaiting === 0
            );
        },
    },
    {
        name: 'buildStats: 3 seated, 1 no-show, 1 waiting => correct counts (AC-R2/R3)',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const entries: Entry[] = [
                makeEntry({ state: 'seated', removedReason: 'seated', joinedAt: ptDate(11, 0), removedAt: ptDate(11, 10) }),
                makeEntry({ state: 'seated', removedReason: 'seated', joinedAt: ptDate(11, 10), removedAt: ptDate(11, 24) }),
                makeEntry({ state: 'seated', removedReason: 'seated', joinedAt: ptDate(11, 20), removedAt: ptDate(11, 32) }),
                makeEntry({ state: 'no_show', removedReason: 'no_show', joinedAt: ptDate(12, 0), removedAt: ptDate(12, 30) }),
                { state: 'waiting', joinedAt: ptDate(12, 15), removedAt: undefined, removedReason: undefined },
            ];
            const stats = buildStats(entries, 8);
            return (
                stats.partiesSeated === 3 &&
                stats.noShows === 1 &&
                stats.totalJoined === 5 &&
                stats.stillWaiting === 1
            );
        },
    },
    {
        name: 'buildStats: configured 8 vs actual 12 (AC-R6)',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const entries: Entry[] = [
                makeEntry({ joinedAt: ptDate(12, 0), removedAt: ptDate(12, 10) }),
                makeEntry({ joinedAt: ptDate(12, 5), removedAt: ptDate(12, 19) }),
                makeEntry({ joinedAt: ptDate(12, 10), removedAt: ptDate(12, 22) }),
            ];
            const stats = buildStats(entries, 8);
            return stats.configuredTurnTime === 8 && stats.actualTurnTime === 12;
        },
    },
    {
        name: 'buildStats: only no-shows => seated 0, avgWait null, actualTurnTime null',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const entries: Entry[] = [
                makeEntry({ state: 'no_show', removedReason: 'no_show', joinedAt: ptDate(12, 0), removedAt: ptDate(12, 30) }),
                makeEntry({ state: 'no_show', removedReason: 'no_show', joinedAt: ptDate(13, 0), removedAt: ptDate(13, 20) }),
            ];
            const stats = buildStats(entries, 8);
            return (
                stats.partiesSeated === 0 &&
                stats.noShows === 2 &&
                stats.avgActualWaitMinutes === null &&
                stats.actualTurnTime === null &&
                stats.totalJoined === 2
            );
        },
    },
    {
        name: 'buildStats: peakHourLabel matches peakHour',
        tags: ['unit', 'stats'],
        testFn: async () => {
            const entries: Entry[] = [
                makeEntry({ joinedAt: ptDate(14, 0), removedAt: ptDate(14, 10) }),
            ];
            const stats = buildStats(entries, 8);
            return stats.peakHour === 14 && stats.peakHourLabel === '2 PM';
        },
    },

    // --- Lifecycle phase metrics (issue #24) ---
    {
        name: 'computeAvgPhaseTime: seated→ordered for 2 parties (10m, 14m) => 12',
        tags: ['unit', 'stats', 'lifecycle'],
        testFn: async () => {
            const entries = [
                { seatedAt: ptDate(12, 0), orderedAt: ptDate(12, 10), servedAt: undefined, checkoutAt: undefined, departedAt: undefined },
                { seatedAt: ptDate(12, 5), orderedAt: ptDate(12, 19), servedAt: undefined, checkoutAt: undefined, departedAt: undefined },
            ];
            return computeAvgPhaseTime(entries, 'seatedAt', 'orderedAt') === 12;
        },
    },
    {
        name: 'computeAvgPhaseTime: skips entries missing toField',
        tags: ['unit', 'stats', 'lifecycle'],
        testFn: async () => {
            const entries = [
                { seatedAt: ptDate(12, 0), orderedAt: ptDate(12, 10), servedAt: undefined, checkoutAt: undefined, departedAt: undefined },
                { seatedAt: ptDate(12, 5), orderedAt: undefined, servedAt: undefined, checkoutAt: undefined, departedAt: undefined },
            ];
            return computeAvgPhaseTime(entries, 'seatedAt', 'orderedAt') === 10;
        },
    },
    {
        name: 'computeAvgPhaseTime: no entries with both fields => null',
        tags: ['unit', 'stats', 'lifecycle'],
        testFn: async () => {
            const entries = [
                { seatedAt: ptDate(12, 0), orderedAt: undefined, servedAt: undefined, checkoutAt: undefined, departedAt: undefined },
            ];
            return computeAvgPhaseTime(entries, 'seatedAt', 'orderedAt') === null;
        },
    },
    {
        name: 'computeAvgPhaseTime: seated→departed (table occupancy) with skip',
        tags: ['unit', 'stats', 'lifecycle'],
        testFn: async () => {
            const entries = [
                { seatedAt: ptDate(12, 0), orderedAt: undefined, servedAt: undefined, checkoutAt: undefined, departedAt: ptDate(12, 30) },
                { seatedAt: ptDate(13, 0), orderedAt: ptDate(13, 5), servedAt: ptDate(13, 20), checkoutAt: ptDate(13, 35), departedAt: ptDate(13, 40) },
            ];
            // First: 30m, Second: 40m => avg 35m
            return computeAvgPhaseTime(entries, 'seatedAt', 'departedAt') === 35;
        },
    },
    {
        name: 'computeAvgWait: uses seatedAt when available (new lifecycle model)',
        tags: ['unit', 'stats', 'lifecycle'],
        testFn: async () => {
            const entries = [
                makeEntry({
                    state: 'departed',
                    joinedAt: ptDate(12, 0),
                    seatedAt: ptDate(12, 8),
                    removedAt: ptDate(12, 40),
                    removedReason: 'departed',
                }),
            ];
            // Should use seatedAt (8m) not removedAt (40m)
            return computeAvgWait(entries) === 8;
        },
    },
    {
        name: 'buildStats: lifecycle metrics for full lifecycle entries (AC-R9)',
        tags: ['unit', 'stats', 'lifecycle'],
        testFn: async () => {
            const entries: Entry[] = [
                makeEntry({
                    state: 'departed',
                    joinedAt: ptDate(12, 0),
                    seatedAt: ptDate(12, 8),
                    orderedAt: ptDate(12, 18),  // 10m order time
                    servedAt: ptDate(12, 33),   // 15m serve time
                    checkoutAt: ptDate(12, 48), // 15m eating
                    departedAt: ptDate(12, 53), // 5m checkout
                    removedAt: ptDate(12, 53),
                    removedReason: 'departed',
                }),
                makeEntry({
                    state: 'departed',
                    joinedAt: ptDate(13, 0),
                    seatedAt: ptDate(13, 10),
                    orderedAt: ptDate(13, 20),  // 10m order time
                    servedAt: ptDate(13, 40),   // 20m serve time
                    checkoutAt: ptDate(13, 55), // 15m eating
                    departedAt: ptDate(14, 0),  // 5m checkout
                    removedAt: ptDate(14, 0),
                    removedReason: 'departed',
                }),
            ];
            const stats = buildStats(entries, 8);
            return (
                stats.avgOrderTimeMinutes === 10 &&   // (10+10)/2
                stats.avgServeTimeMinutes === 18 &&    // (15+20)/2 = 17.5, Math.round = 18
                stats.avgCheckoutTimeMinutes === 5 &&  // (5+5)/2
                stats.avgTableOccupancyMinutes === 48  // ((53-8=45) + (60-10=50))/2 = 47.5 rounded to 48
            );
        },
    },
    {
        name: 'buildStats: departed parties counted as seated (backward compat)',
        tags: ['unit', 'stats', 'lifecycle'],
        testFn: async () => {
            const entries: Entry[] = [
                makeEntry({
                    state: 'departed',
                    joinedAt: ptDate(12, 0),
                    seatedAt: ptDate(12, 8),
                    departedAt: ptDate(12, 40),
                    removedAt: ptDate(12, 40),
                    removedReason: 'departed',
                }),
                makeEntry({
                    state: 'ordered',
                    joinedAt: ptDate(13, 0),
                    seatedAt: ptDate(13, 10),
                    orderedAt: ptDate(13, 20),
                }),
            ];
            const stats = buildStats(entries, 8);
            return stats.partiesSeated === 2 && stats.noShows === 0 && stats.stillWaiting === 0;
        },
    },
    {
        name: 'buildStats: lifecycle metrics null when no departed parties',
        tags: ['unit', 'stats', 'lifecycle'],
        testFn: async () => {
            const entries: Entry[] = [
                makeEntry({
                    state: 'seated',
                    joinedAt: ptDate(12, 0),
                    seatedAt: ptDate(12, 8),
                }),
            ];
            const stats = buildStats(entries, 8);
            return (
                stats.avgOrderTimeMinutes === null &&
                stats.avgServeTimeMinutes === null &&
                stats.avgCheckoutTimeMinutes === null &&
                stats.avgTableOccupancyMinutes === null
            );
        },
    },
];

void runTests(cases, 'stats service (pure)');
