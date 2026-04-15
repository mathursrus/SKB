// Unit tests for src/services/analytics.ts — histogram + stage-range helpers
import { runTests, type BaseTestCase } from '../test-utils.js';
import {
    buildHistogram,
    buildRangeLabel,
    isValidAnalyticsStagePair,
} from '../../src/services/analytics.js';

const cases: BaseTestCase[] = [
    {
        name: 'buildHistogram: empty array returns empty buckets',
        tags: ['unit', 'analytics'],
        testFn: async () => {
            const result = buildHistogram([]);
            return result.length === 0;
        },
    },
    {
        name: 'buildHistogram: single value 7 → bucket 5-10m has count 1',
        tags: ['unit', 'analytics'],
        testFn: async () => {
            const result = buildHistogram([7]);
            const bucket = result.find(b => b.minMinutes === 5);
            return !!bucket && bucket.count === 1 && bucket.probability === 1;
        },
    },
    {
        name: 'buildHistogram: value 0 → first bucket (0-5m)',
        tags: ['unit', 'analytics'],
        testFn: async () => {
            const result = buildHistogram([0]);
            return result[0].count === 1 && result[0].minMinutes === 0;
        },
    },
    {
        name: 'buildHistogram: multiple values distribute correctly',
        tags: ['unit', 'analytics'],
        testFn: async () => {
            // 3, 7, 12, 18, 22 → buckets 0-5(1), 5-10(1), 10-15(1), 15-20(1), 20-25(1)
            const result = buildHistogram([3, 7, 12, 18, 22]);
            return result[0].count === 1 && result[1].count === 1 &&
                result[2].count === 1 && result[3].count === 1 && result[4].count === 1;
        },
    },
    {
        name: 'buildHistogram: probabilities sum to ~1.0',
        tags: ['unit', 'analytics'],
        testFn: async () => {
            const result = buildHistogram([3, 7, 12, 18, 22]);
            const sum = result.reduce((a, b) => a + b.probability, 0);
            return Math.abs(sum - 1.0) < 0.01;
        },
    },
    {
        name: 'buildHistogram: same bucket accumulates',
        tags: ['unit', 'analytics'],
        testFn: async () => {
            // 6, 7, 8, 9 → all in bucket 5-10m
            const result = buildHistogram([6, 7, 8, 9]);
            const bucket = result.find(b => b.minMinutes === 5);
            return !!bucket && bucket.count === 4 && bucket.probability === 1;
        },
    },
    {
        name: 'buildHistogram: large values capped at 120m bucket',
        tags: ['unit', 'analytics'],
        testFn: async () => {
            const result = buildHistogram([150]);
            const last = result[result.length - 1];
            return last.count === 1 && last.minMinutes === 120;
        },
    },
    {
        name: 'buildHistogram: probability is rounded to 3 decimal places',
        tags: ['unit', 'analytics'],
        testFn: async () => {
            const result = buildHistogram([3, 3, 3, 7]); // 0-5m: 3/4=0.75, 5-10m: 1/4=0.25
            const b0 = result.find(b => b.minMinutes === 0);
            const b1 = result.find(b => b.minMinutes === 5);
            return !!b0 && b0.probability === 0.75 && !!b1 && b1.probability === 0.25;
        },
    },
    {
        name: 'isValidAnalyticsStagePair: joined to seated is valid',
        tags: ['unit', 'analytics'],
        testFn: async () => isValidAnalyticsStagePair('joined', 'seated') === true,
    },
    {
        name: 'isValidAnalyticsStagePair: ordered to served is valid',
        tags: ['unit', 'analytics'],
        testFn: async () => isValidAnalyticsStagePair('ordered', 'served') === true,
    },
    {
        name: 'isValidAnalyticsStagePair: seated to departed is valid',
        tags: ['unit', 'analytics'],
        testFn: async () => isValidAnalyticsStagePair('seated', 'departed') === true,
    },
    {
        name: 'isValidAnalyticsStagePair: served to ordered is invalid',
        tags: ['unit', 'analytics'],
        testFn: async () => isValidAnalyticsStagePair('served', 'ordered') === false,
    },
    {
        name: 'isValidAnalyticsStagePair: same start and end is invalid',
        tags: ['unit', 'analytics'],
        testFn: async () => isValidAnalyticsStagePair('joined', 'joined') === false,
    },
    {
        name: 'buildRangeLabel: ordered to served uses readable label',
        tags: ['unit', 'analytics'],
        testFn: async () => buildRangeLabel('ordered', 'served') === 'Ordered -> Served',
    },
];

void runTests(cases, 'analytics (buildHistogram)');
