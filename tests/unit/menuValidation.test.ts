// Unit tests for src/services/locations.ts `validateMenu` — the pure
// input-validation half of the menu-builder stack. DB-bound persistence
// is covered in tests/integration/menu.integration.test.ts.
import { runTests, type BaseTestCase } from '../test-utils.js';
import { validateMenu } from '../../src/services/locations.js';
import type { LocationMenu } from '../../src/types/queue.js';

function throws(fn: () => void, match?: string): boolean {
    try {
        fn();
        return false;
    } catch (e) {
        if (!match) return true;
        return e instanceof Error && e.message.includes(match);
    }
}

const GOOD: LocationMenu = {
    sections: [
        {
            id: 's1',
            title: 'Appetizers',
            items: [
                { id: 'i1', name: 'Samosa' },
                { id: 'i2', name: 'Pakora', description: 'Spiced, fried.', price: '$8' },
            ],
        },
        { id: 's2', title: 'Mains', items: [{ id: 'i3', name: 'Biryani', price: '$18' }] },
    ],
};

const cases: BaseTestCase[] = [
    // ── Happy path ─────────────────────────────────────────────────────
    {
        name: 'valid menu with sections + items passes',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => { validateMenu(GOOD); return true; },
    },
    {
        name: 'empty sections array is valid (operator cleared the menu in the UI)',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => { validateMenu({ sections: [] }); return true; },
    },
    {
        name: 'section with zero items is valid (operator added section header, not filled yet)',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => { validateMenu({ sections: [{ id: 's1', title: 'Desserts', items: [] }] }); return true; },
    },

    // ── Structural errors ──────────────────────────────────────────────
    {
        name: 'missing sections array throws',
        tags: ['unit', 'menu', 'validation', 'error'],
        testFn: async () => throws(
            () => validateMenu({} as unknown as LocationMenu),
            'menu.sections must be an array',
        ),
    },
    {
        name: 'sections must be an array (object rejected)',
        tags: ['unit', 'menu', 'validation', 'error'],
        testFn: async () => throws(
            () => validateMenu({ sections: {} } as unknown as LocationMenu),
            'menu.sections must be an array',
        ),
    },

    // ── Limits ─────────────────────────────────────────────────────────
    {
        name: 'rejects >20 sections',
        tags: ['unit', 'menu', 'validation', 'limits'],
        testFn: async () => {
            const sections = Array.from({ length: 21 }, (_, i) => ({ id: 's' + i, title: 'T' + i, items: [] }));
            return throws(() => validateMenu({ sections }), 'sections must be <= 20');
        },
    },
    {
        name: 'rejects >60 items in one section',
        tags: ['unit', 'menu', 'validation', 'limits'],
        testFn: async () => {
            const items = Array.from({ length: 61 }, (_, i) => ({ id: 'i' + i, name: 'Dish ' + i }));
            return throws(() => validateMenu({ sections: [{ id: 's1', title: 'X', items }] }), 'items must be <= 60');
        },
    },
    {
        name: 'rejects section.title >80 chars',
        tags: ['unit', 'menu', 'validation', 'limits'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: 's1', title: 'x'.repeat(81), items: [] }] }),
            'section.title must be <= 80 chars',
        ),
    },
    {
        name: 'rejects item.name >120 chars',
        tags: ['unit', 'menu', 'validation', 'limits'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: 's1', title: 'X', items: [{ id: 'i1', name: 'x'.repeat(121) }] }] }),
            'item.name must be <= 120 chars',
        ),
    },
    {
        name: 'rejects item.description >500 chars',
        tags: ['unit', 'menu', 'validation', 'limits'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: 's1', title: 'X', items: [{ id: 'i1', name: 'A', description: 'x'.repeat(501) }] }] }),
            'item.description must be <= 500 chars',
        ),
    },
    {
        name: 'rejects item.price >40 chars',
        tags: ['unit', 'menu', 'validation', 'limits'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: 's1', title: 'X', items: [{ id: 'i1', name: 'A', price: '$'.padEnd(42, 'x') }] }] }),
            'item.price must be <= 40 chars',
        ),
    },

    // ── Required fields ────────────────────────────────────────────────
    {
        name: 'rejects empty section.id',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: '', title: 'X', items: [] }] }),
            'section.id must be a non-empty string',
        ),
    },
    {
        name: 'rejects empty section.title',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: 's1', title: '', items: [] }] }),
            'section.title is required',
        ),
    },
    {
        name: 'rejects whitespace-only section.title',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: 's1', title: '   ', items: [] }] }),
            'section.title is required',
        ),
    },
    {
        name: 'rejects empty item.name',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: 's1', title: 'X', items: [{ id: 'i1', name: '' }] }] }),
            'item.name is required',
        ),
    },

    // ── Duplicate IDs (stability invariant) ───────────────────────────
    {
        name: 'rejects duplicate section ids',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => throws(
            () => validateMenu({
                sections: [
                    { id: 'same', title: 'A', items: [] },
                    { id: 'same', title: 'B', items: [] },
                ],
            }),
            'section.id duplicate',
        ),
    },
    {
        name: 'rejects duplicate item ids within a section',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => throws(
            () => validateMenu({
                sections: [{
                    id: 's1', title: 'X',
                    items: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }],
                }],
            }),
            'item.id duplicate',
        ),
    },
    {
        name: 'allows same item id across different sections (section-scoped uniqueness)',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => {
            validateMenu({
                sections: [
                    { id: 's1', title: 'A', items: [{ id: 'shared', name: 'X' }] },
                    { id: 's2', title: 'B', items: [{ id: 'shared', name: 'Y' }] },
                ],
            });
            return true;
        },
    },

    // ── Type checks ────────────────────────────────────────────────────
    {
        name: 'rejects non-string item.description',
        tags: ['unit', 'menu', 'validation'],
        testFn: async () => throws(
            () => validateMenu({ sections: [{ id: 's1', title: 'X', items: [{ id: 'i1', name: 'A', description: 42 as unknown as string }] }] }),
            'item.description must be a string',
        ),
    },
];

runTests(cases, 'menu validation (issue #51)');
