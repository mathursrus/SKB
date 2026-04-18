// ============================================================================
// Unit tests for src/services/signup.ts (issue #54)
// ============================================================================
//
// Pure-logic surface: kebab-case slug derivation, slug collision fallback
// chain (base → base-city → base-2 → base-3…), explicit-slug validation,
// and 4-digit PIN generation. The DB-backed signupOwner() is exercised
// in the integration suite.
// ============================================================================

import { runTests, type BaseTestCase } from '../test-utils.js';

import {
    kebabCase,
    pickAvailableSlug,
    validateExplicitSlug,
    generateHostPin,
    SignupValidationError,
    SignupConflictError,
} from '../../src/services/signup.js';

function makeExists(taken: Set<string>) {
    return async (slug: string) => taken.has(slug);
}

const cases: BaseTestCase[] = [
    {
        name: 'kebabCase: simple name',
        tags: ['unit', 'signup'],
        testFn: async () => kebabCase('Ramen Yokocho') === 'ramen-yokocho',
    },
    {
        name: 'kebabCase: strips diacritics',
        tags: ['unit', 'signup'],
        testFn: async () => kebabCase('The Corner Café') === 'the-corner-cafe',
    },
    {
        name: 'kebabCase: collapses punctuation',
        tags: ['unit', 'signup'],
        testFn: async () => kebabCase('  A & B  ') === 'a-b',
    },
    {
        name: 'kebabCase: all-non-alphanumeric returns empty',
        tags: ['unit', 'signup'],
        testFn: async () => kebabCase('@@@ !!!') === '',
    },
    {
        name: 'kebabCase: trims trailing dashes',
        tags: ['unit', 'signup'],
        testFn: async () => kebabCase('--weird--') === 'weird',
    },
    {
        name: 'pickAvailableSlug: base when nothing taken',
        tags: ['unit', 'signup'],
        testFn: async () => {
            const taken = new Set<string>();
            const out = await pickAvailableSlug('ramen', 'seattle', makeExists(taken));
            return out === 'ramen';
        },
    },
    {
        name: 'pickAvailableSlug: falls back to base-city on collision',
        tags: ['unit', 'signup'],
        testFn: async () => {
            const taken = new Set(['the-corner']);
            const out = await pickAvailableSlug('the-corner', 'seattle', makeExists(taken));
            return out === 'the-corner-seattle';
        },
    },
    {
        name: 'pickAvailableSlug: falls back to numeric suffix when base AND base-city taken',
        tags: ['unit', 'signup'],
        testFn: async () => {
            const taken = new Set(['the-corner', 'the-corner-seattle', 'the-corner-2']);
            const out = await pickAvailableSlug('the-corner', 'seattle', makeExists(taken));
            return out === 'the-corner-3';
        },
    },
    {
        name: 'pickAvailableSlug: skips city step when city slug equals base',
        tags: ['unit', 'signup'],
        testFn: async () => {
            const taken = new Set(['seattle']);
            const out = await pickAvailableSlug('seattle', 'seattle', makeExists(taken));
            return out === 'seattle-2';
        },
    },
    {
        name: 'pickAvailableSlug: throws on empty base',
        tags: ['unit', 'signup'],
        testFn: async () => {
            try {
                await pickAvailableSlug('', 'seattle', async () => false);
                return false;
            } catch (err) {
                return err instanceof SignupValidationError && err.field === 'restaurantName';
            }
        },
    },
    {
        name: 'validateExplicitSlug: accepts well-formed',
        tags: ['unit', 'signup'],
        testFn: async () => validateExplicitSlug('my-restaurant-42') === 'my-restaurant-42',
    },
    {
        name: 'validateExplicitSlug: rejects reserved',
        tags: ['unit', 'signup'],
        testFn: async () => {
            for (const bad of ['admin', 'api', 'login', 'signup', 'r']) {
                try {
                    validateExplicitSlug(bad);
                    return false;
                } catch (err) {
                    if (!(err instanceof SignupValidationError)) return false;
                }
            }
            return true;
        },
    },
    {
        name: 'validateExplicitSlug: normalizes uppercase + spaces',
        tags: ['unit', 'signup'],
        testFn: async () => validateExplicitSlug('  My Slug  ') === 'my-slug',
    },
    {
        name: 'validateExplicitSlug: rejects too-short',
        tags: ['unit', 'signup'],
        testFn: async () => {
            try { validateExplicitSlug('a'); return false; }
            catch (err) { return err instanceof SignupValidationError; }
        },
    },
    {
        name: 'validateExplicitSlug: rejects too-long',
        tags: ['unit', 'signup'],
        testFn: async () => {
            try { validateExplicitSlug('a'.repeat(100)); return false; }
            catch (err) { return err instanceof SignupValidationError; }
        },
    },
    {
        name: 'generateHostPin: 4 digits',
        tags: ['unit', 'signup'],
        testFn: async () => {
            for (let i = 0; i < 100; i += 1) {
                const pin = generateHostPin();
                if (!/^\d{4}$/.test(pin)) return false;
            }
            return true;
        },
    },
    {
        name: 'generateHostPin: includes zero-padded values in range',
        tags: ['unit', 'signup'],
        testFn: async () => {
            // Statistical spot-check: over 10k draws we should see at least
            // some values in every 1000-bucket. Crude but catches off-by-one
            // randomInt bounds.
            const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (let i = 0; i < 10000; i += 1) {
                const pin = generateHostPin();
                const n = parseInt(pin, 10);
                buckets[Math.floor(n / 1000)] += 1;
            }
            return buckets.every(count => count > 0);
        },
    },
    {
        name: 'SignupValidationError + SignupConflictError carry field',
        tags: ['unit', 'signup'],
        testFn: async () => {
            const v = new SignupValidationError('email', 'bad');
            const c = new SignupConflictError('slug', 'taken');
            return v.field === 'email' && c.field === 'slug' && v.message === 'bad' && c.message === 'taken';
        },
    },
];

runTests(cases, 'src/services/signup.ts');
