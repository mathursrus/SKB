// Unit tests for pure helpers in src/services/queue.ts
import { runTests } from '../test-utils.js';
import { computeEtaMinutes, positionInList, validateSetPartyEtaInput } from '../../src/services/queue.js';

interface T { name: string; description?: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const cases: T[] = [
    // -- ETA edit input validation (issue #106) --
    {
        name: 'validateSetPartyEtaInput: throws on malformed id',
        tags: ['unit', 'queue', 'eta', 'issue-106'],
        testFn: async () => {
            try {
                validateSetPartyEtaInput('not-an-objectid', new Date());
                return false;
            } catch (err) {
                return err instanceof Error && err.message === 'invalid id';
            }
        },
    },
    {
        name: 'validateSetPartyEtaInput: throws on invalid Date',
        tags: ['unit', 'queue', 'eta', 'issue-106'],
        testFn: async () => {
            try {
                validateSetPartyEtaInput('507f1f77bcf86cd799439011', new Date('not-a-date'));
                return false;
            } catch (err) {
                return err instanceof Error && err.message === 'invalid etaAt';
            }
        },
    },
    {
        name: 'validateSetPartyEtaInput: returns ObjectId for valid input',
        tags: ['unit', 'queue', 'eta', 'issue-106'],
        testFn: async () => {
            const { _id } = validateSetPartyEtaInput('507f1f77bcf86cd799439011', new Date('2026-04-29T20:00:00Z'));
            return _id.toHexString() === '507f1f77bcf86cd799439011';
        },
    },
    {
        name: 'computeEtaMinutes: position 1, turn 8 => 8',
        tags: ['unit', 'queue'],
        testFn: async () => computeEtaMinutes(1, 8) === 8,
    },
    {
        name: 'computeEtaMinutes: position 3, turn 8 => 24',
        tags: ['unit', 'queue'],
        testFn: async () => computeEtaMinutes(3, 8) === 24,
    },
    {
        name: 'computeEtaMinutes: invalid (0) position => 0',
        tags: ['unit', 'queue'],
        testFn: async () => computeEtaMinutes(0, 8) === 0,
    },
    {
        name: 'computeEtaMinutes: negative position => 0',
        tags: ['unit', 'queue'],
        testFn: async () => computeEtaMinutes(-1, 8) === 0,
    },
    {
        name: 'positionInList finds code at expected 1-based position',
        tags: ['unit', 'queue'],
        testFn: async () => {
            const waiting = [{ code: 'SKB-AAA' }, { code: 'SKB-BBB' }, { code: 'SKB-CCC' }];
            return (
                positionInList(waiting, 'SKB-AAA') === 1 &&
                positionInList(waiting, 'SKB-BBB') === 2 &&
                positionInList(waiting, 'SKB-CCC') === 3
            );
        },
    },
    {
        name: 'positionInList returns 0 for missing',
        tags: ['unit', 'queue'],
        testFn: async () =>
            positionInList([{ code: 'SKB-AAA' }], 'SKB-ZZZ') === 0,
    },
    {
        name: 'ETA shifts earlier when position drops by one (R7)',
        tags: ['unit', 'queue'],
        testFn: async () => {
            const turn = 8;
            const before = computeEtaMinutes(3, turn); // 24
            const after = computeEtaMinutes(2, turn); // 16
            return before - after === turn;
        },
    },
];

void runTests(cases, 'queue service (pure)');
