// Unit tests for src/core/utils/time.ts — PT service-day rollover
import { runTests } from './test-utils.js';
import { serviceDay, minutesBetween, addMinutes } from '../src/core/utils/time.js';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const cases: T[] = [
    {
        name: 'serviceDay returns YYYY-MM-DD',
        tags: ['unit', 'time'],
        testFn: async () => /^\d{4}-\d{2}-\d{2}$/.test(serviceDay(new Date('2026-04-05T15:00:00Z'))),
    },
    {
        name: 'serviceDay 2026-04-05 07:00Z => 2026-04-05 PT (midnight PDT = 07:00Z)',
        tags: ['unit', 'time'],
        testFn: async () => {
            // 07:00Z on a PDT date is midnight PT exactly.
            return serviceDay(new Date('2026-04-05T07:00:00Z')) === '2026-04-05';
        },
    },
    {
        name: 'serviceDay just before midnight PT belongs to previous day',
        tags: ['unit', 'time'],
        testFn: async () => {
            // 06:59Z April 5 = 23:59 PDT April 4
            return serviceDay(new Date('2026-04-05T06:59:00Z')) === '2026-04-04';
        },
    },
    {
        name: 'serviceDay noon PT gives expected date',
        tags: ['unit', 'time'],
        testFn: async () => {
            // 19:00Z = 12:00 PDT
            return serviceDay(new Date('2026-04-05T19:00:00Z')) === '2026-04-05';
        },
    },
    {
        name: 'minutesBetween never goes negative',
        tags: ['unit', 'time'],
        testFn: async () => {
            const a = new Date('2026-04-05T12:00:00Z');
            const b = new Date('2026-04-05T11:00:00Z');
            return minutesBetween(a, b) === 0;
        },
    },
    {
        name: 'addMinutes adds whole minutes exactly',
        tags: ['unit', 'time'],
        testFn: async () => {
            const d = new Date('2026-04-05T12:00:00Z');
            return addMinutes(d, 15).toISOString() === '2026-04-05T12:15:00.000Z';
        },
    },
];

void runTests(cases, 'time / service-day');
