// Unit tests for pure helpers in src/services/settings.ts
import { runTests, type BaseTestCase } from '../test-utils.js';
import { medianMinutes } from '../../src/services/settings.js';

const cases: BaseTestCase[] = [
    {
        name: 'medianMinutes: empty array → 0',
        tags: ['unit', 'settings'],
        testFn: async () => medianMinutes([]) === 0,
    },
    {
        name: 'medianMinutes: single element → that element',
        tags: ['unit', 'settings'],
        testFn: async () => medianMinutes([12]) === 12,
    },
    {
        name: 'medianMinutes: two elements → mean',
        tags: ['unit', 'settings'],
        testFn: async () => medianMinutes([10, 14]) === 12,
    },
    {
        name: 'medianMinutes: three elements → middle value',
        tags: ['unit', 'settings'],
        testFn: async () => medianMinutes([8, 12, 20]) === 12,
    },
    {
        name: 'medianMinutes: five elements → middle (already sorted)',
        tags: ['unit', 'settings'],
        testFn: async () => medianMinutes([5, 8, 10, 12, 15]) === 10,
    },
    {
        name: 'medianMinutes: five elements → middle (unsorted input)',
        tags: ['unit', 'settings'],
        testFn: async () => medianMinutes([12, 5, 15, 8, 10]) === 10,
    },
    {
        name: 'medianMinutes: robust to single outlier (median unaffected)',
        tags: ['unit', 'settings'],
        testFn: async () => {
            // One 180-minute anniversary dinner should not pull the median up.
            // Mean would be (8+10+12+15+180)/5 = 45. Median is still 12.
            return medianMinutes([8, 10, 12, 15, 180]) === 12;
        },
    },
    {
        name: 'medianMinutes: does not mutate input',
        tags: ['unit', 'settings'],
        testFn: async () => {
            const input = [5, 2, 8, 1, 9];
            const snapshot = [...input];
            medianMinutes(input);
            return JSON.stringify(input) === JSON.stringify(snapshot);
        },
    },
    {
        name: 'medianMinutes: even length → mean of two middle values',
        tags: ['unit', 'settings'],
        testFn: async () => {
            // [4, 6, 8, 10, 12, 14] → middle two are 8 and 10 → mean 9
            return medianMinutes([4, 6, 8, 10, 12, 14]) === 9;
        },
    },
    {
        name: 'medianMinutes: all identical values → that value',
        tags: ['unit', 'settings'],
        testFn: async () => medianMinutes([12, 12, 12, 12, 12]) === 12,
    },
];

void runTests(cases, 'settings unit tests');
