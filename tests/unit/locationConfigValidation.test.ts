// Unit tests for src/services/locations.ts — pure validation + public
// projection. DB-bound paths (updateLocationSiteConfig, getLocation) are
// exercised by the integration suite.
import { runTests, type BaseTestCase } from '../test-utils.js';
import { validateSiteConfigUpdate, toPublicLocation } from '../../src/services/locations.js';
import type { Location, LocationAddress, WeeklyHours } from '../../src/types/queue.js';

const GOOD_ADDRESS: LocationAddress = {
    street: '12 Bellevue Way SE',
    city: 'Bellevue',
    state: 'WA',
    zip: '98004',
};

const GOOD_HOURS: WeeklyHours = {
    mon: 'closed',
    tue: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    wed: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    thu: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    fri: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    sat: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    sun: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
};

function throws(fn: () => void, match?: string): boolean {
    try {
        fn();
        return false;
    } catch (e) {
        if (!match) return true;
        return e instanceof Error && e.message.includes(match);
    }
}

const cases: BaseTestCase[] = [
    // Valid updates — must NOT throw
    {
        name: 'valid empty update passes',
        tags: ['unit', 'locations'],
        testFn: async () => {
            validateSiteConfigUpdate({});
            return true;
        },
    },
    {
        name: 'valid address passes',
        tags: ['unit', 'locations'],
        testFn: async () => {
            validateSiteConfigUpdate({ address: GOOD_ADDRESS });
            return true;
        },
    },
    {
        name: 'valid hours passes',
        tags: ['unit', 'locations'],
        testFn: async () => {
            validateSiteConfigUpdate({ hours: GOOD_HOURS });
            return true;
        },
    },
    {
        name: 'publicHost bare domain passes',
        tags: ['unit', 'locations'],
        testFn: async () => {
            validateSiteConfigUpdate({ publicHost: 'skbbellevue.com' });
            return true;
        },
    },
    {
        name: 'publicHost with subdomain passes',
        tags: ['unit', 'locations'],
        testFn: async () => {
            validateSiteConfigUpdate({ publicHost: 'www.skbbellevue.com' });
            return true;
        },
    },
    {
        name: 'clearing fields with null passes',
        tags: ['unit', 'locations'],
        testFn: async () => {
            validateSiteConfigUpdate({
                address: null,
                hours: null,
                publicHost: null,
            });
            return true;
        },
    },

    // Invalid inputs — must throw with specific messages
    {
        name: 'address missing street throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({ address: { ...GOOD_ADDRESS, street: '' } }),
            'address.street is required',
        ),
    },
    {
        name: 'address missing city throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({ address: { ...GOOD_ADDRESS, city: '' } }),
            'address.city is required',
        ),
    },
    {
        name: 'address invalid state throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({ address: { ...GOOD_ADDRESS, state: 'WASH' } }),
            'state must be a 2-letter',
        ),
    },
    {
        name: 'address invalid zip throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({ address: { ...GOOD_ADDRESS, zip: '9ABCD' } }),
            'zip must be 5 digits',
        ),
    },
    {
        name: 'address with 9-digit zip passes',
        tags: ['unit', 'locations'],
        testFn: async () => {
            validateSiteConfigUpdate({ address: { ...GOOD_ADDRESS, zip: '98004-1234' } });
            return true;
        },
    },
    {
        name: 'hours with open >= close throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({
                hours: { fri: { lunch: { open: '14:30', close: '11:30' } } },
            }),
            'must be earlier than close',
        ),
    },
    {
        name: 'hours with malformed time throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({
                hours: { fri: { lunch: { open: '11:3', close: '14:30' } } },
            }),
            'HH:mm',
        ),
    },
    {
        name: 'hours with 24:00 throws (invalid hour)',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({
                hours: { fri: { lunch: { open: '11:30', close: '24:00' } } },
            }),
            'HH:mm',
        ),
    },
    {
        name: 'hours with neither lunch nor dinner throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({
                hours: { fri: {} },
            }),
            'at least one of lunch or dinner',
        ),
    },
    {
        name: 'hours with unknown day throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            () => validateSiteConfigUpdate({ hours: { funday: 'closed' } as any }),
            'unknown day',
        ),
    },
    {
        name: 'publicHost with scheme throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({ publicHost: 'https://skbbellevue.com' }),
            'bare domain',
        ),
    },
    {
        name: 'publicHost with trailing slash throws',
        tags: ['unit', 'locations'],
        testFn: async () => throws(
            () => validateSiteConfigUpdate({ publicHost: 'skbbellevue.com/' }),
            'bare domain',
        ),
    },

    // toPublicLocation projection
    {
        name: 'toPublicLocation strips pin',
        tags: ['unit', 'locations'],
        testFn: async () => {
            const full: Location = {
                _id: 'skb',
                name: 'Shri Krishna Bhavan',
                pin: '1234',
                createdAt: new Date(),
            };
            const pub = toPublicLocation(full);
            return !('pin' in pub) && !('_id' in pub) && pub.name === 'Shri Krishna Bhavan';
        },
    },
    {
        name: 'toPublicLocation includes address/hours/frontDeskPhone when present',
        tags: ['unit', 'locations'],
        testFn: async () => {
            const full: Location = {
                _id: 'skb',
                name: 'Shri Krishna Bhavan',
                pin: '1234',
                createdAt: new Date(),
                address: GOOD_ADDRESS,
                hours: GOOD_HOURS,
                frontDeskPhone: '2065551234',
            };
            const pub = toPublicLocation(full);
            return pub.address?.street === '12 Bellevue Way SE'
                && pub.hours?.mon === 'closed'
                && pub.frontDeskPhone === '2065551234';
        },
    },
    {
        name: 'toPublicLocation omits unset optional fields',
        tags: ['unit', 'locations'],
        testFn: async () => {
            const full: Location = {
                _id: 'skb',
                name: 'Shri Krishna Bhavan',
                pin: '1234',
                createdAt: new Date(),
            };
            const pub = toPublicLocation(full);
            return pub.address === undefined && pub.hours === undefined && pub.frontDeskPhone === undefined;
        },
    },
];

runTests(cases, 'Site Config Validation + Public Projection');
