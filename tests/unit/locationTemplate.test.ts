// Unit tests for src/services/location-template.ts
import { runTests } from '../test-utils.js';
import {
    formatAddressForSpeech,
    formatAddressForWeb,
    buildGoogleMapsEmbedUrl,
    formatWeeklyHoursForSpeech,
    formatWeeklyHoursForWeb,
    formatTimeForWeb,
    MENU_OVERVIEW_SCRIPT,
    HOURS_LOCATION_FALLBACK_SCRIPT,
} from '../../src/services/location-template.js';
import type { LocationAddress, WeeklyHours } from '../../src/types/queue.js';

interface T { name: string; tags?: string[]; testFn?: () => Promise<boolean>; }

const SKB_ADDRESS: LocationAddress = {
    street: '12 Bellevue Way SE',
    city: 'Bellevue',
    state: 'WA',
    zip: '98004',
};

const SKB_HOURS: WeeklyHours = {
    mon: 'closed',
    tue: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    wed: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    thu: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    fri: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    sat: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    sun: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
};

const ALL_DAYS_HOURS: WeeklyHours = {
    mon: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    tue: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    wed: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    thu: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    fri: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    sat: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
    sun: { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } },
};

const cases: T[] = [
    // formatAddressForSpeech
    {
        name: 'formatAddressForSpeech expands WA to Washington',
        tags: ['unit', 'location'],
        testFn: async () => formatAddressForSpeech(SKB_ADDRESS) === '12 Bellevue Way SE in Bellevue, Washington',
    },
    {
        name: 'formatAddressForSpeech omits zip even when present',
        tags: ['unit', 'location'],
        testFn: async () => !formatAddressForSpeech(SKB_ADDRESS).includes('98004'),
    },
    {
        name: 'formatAddressForSpeech returns empty for undefined',
        tags: ['unit', 'location'],
        testFn: async () => formatAddressForSpeech(undefined) === '',
    },
    {
        name: 'formatAddressForSpeech returns empty for null',
        tags: ['unit', 'location'],
        testFn: async () => formatAddressForSpeech(null) === '',
    },
    {
        name: 'formatAddressForSpeech returns empty when street is missing',
        tags: ['unit', 'location'],
        testFn: async () => formatAddressForSpeech({ street: '', city: 'Bellevue', state: 'WA', zip: '98004' }) === '',
    },
    {
        name: 'formatAddressForSpeech falls back to state code for unknown state',
        tags: ['unit', 'location'],
        testFn: async () => formatAddressForSpeech({ street: '1 Main St', city: 'Springfield', state: 'ZZ', zip: '00000' }) === '1 Main St in Springfield, ZZ',
    },

    // formatAddressForWeb
    {
        name: 'formatAddressForWeb produces br-separated HTML',
        tags: ['unit', 'location'],
        testFn: async () => formatAddressForWeb(SKB_ADDRESS) === '12 Bellevue Way SE<br>Bellevue, WA 98004',
    },
    {
        name: 'formatAddressForWeb HTML-escapes street',
        tags: ['unit', 'location'],
        testFn: async () => {
            const addr: LocationAddress = { street: 'A & B <Co>', city: 'Bellevue', state: 'WA', zip: '98004' };
            return formatAddressForWeb(addr) === 'A &amp; B &lt;Co&gt;<br>Bellevue, WA 98004';
        },
    },
    {
        name: 'formatAddressForWeb returns empty for undefined',
        tags: ['unit', 'location'],
        testFn: async () => formatAddressForWeb(undefined) === '',
    },
    {
        name: 'formatAddressForWeb drops zip if absent',
        tags: ['unit', 'location'],
        testFn: async () => formatAddressForWeb({ street: '1 Main', city: 'Bellevue', state: 'WA', zip: '' }) === '1 Main<br>Bellevue, WA',
    },

    // buildGoogleMapsEmbedUrl
    {
        name: 'buildGoogleMapsEmbedUrl URL-encodes the address',
        tags: ['unit', 'location'],
        testFn: async () => buildGoogleMapsEmbedUrl(SKB_ADDRESS) === 'https://www.google.com/maps?q=12%20Bellevue%20Way%20SE%2C%20Bellevue%2C%20WA%2C%2098004&output=embed',
    },
    {
        name: 'buildGoogleMapsEmbedUrl returns empty for undefined',
        tags: ['unit', 'location'],
        testFn: async () => buildGoogleMapsEmbedUrl(undefined) === '',
    },
    {
        name: 'buildGoogleMapsEmbedUrl returns empty when only street is present',
        tags: ['unit', 'location'],
        testFn: async () => buildGoogleMapsEmbedUrl({ street: '1 Main', city: '', state: '', zip: '' }) === '',
    },

    // formatWeeklyHoursForSpeech — SKB closed-Monday pattern
    {
        name: 'formatWeeklyHoursForSpeech says "Tuesday through Sunday" when Monday is closed',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForSpeech(SKB_HOURS).includes('Tuesday through Sunday'),
    },
    {
        name: 'formatWeeklyHoursForSpeech mentions closed Mondays',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForSpeech(SKB_HOURS).includes("closed on Mondays"),
    },
    {
        name: 'formatWeeklyHoursForSpeech includes lunch window',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForSpeech(SKB_HOURS).includes('Lunch service is from 11:30 AM to 2:30 PM'),
    },
    {
        name: 'formatWeeklyHoursForSpeech includes dinner window',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForSpeech(SKB_HOURS).includes('Dinner service is from 5:30 PM to 9:30 PM'),
    },
    {
        name: 'formatWeeklyHoursForSpeech says "seven days a week" when all days are open',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForSpeech(ALL_DAYS_HOURS).includes('seven days a week'),
    },
    {
        name: 'formatWeeklyHoursForSpeech returns empty for undefined',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForSpeech(undefined) === '',
    },
    {
        name: 'formatWeeklyHoursForSpeech handles single open day',
        tags: ['unit', 'location'],
        testFn: async () => {
            const hours: WeeklyHours = { fri: { lunch: { open: '11:30', close: '14:30' } } };
            return formatWeeklyHoursForSpeech(hours).includes('only on Fridays');
        },
    },

    // formatWeeklyHoursForWeb
    {
        name: 'formatWeeklyHoursForWeb renders 7 rows',
        tags: ['unit', 'location'],
        testFn: async () => {
            const out = formatWeeklyHoursForWeb(SKB_HOURS);
            return (out.match(/<tr>/g) || []).length === 7;
        },
    },
    {
        name: 'formatWeeklyHoursForWeb marks Monday Closed',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForWeb(SKB_HOURS).includes('<tr><td>Monday</td><td class="hours-closed">Closed</td></tr>'),
    },
    {
        name: 'formatWeeklyHoursForWeb shows lunch + dinner separated by middot',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForWeb(SKB_HOURS).includes('11:30 AM – 2:30 PM &middot; 5:30 PM – 9:30 PM'),
    },
    {
        name: 'formatWeeklyHoursForWeb returns empty for undefined',
        tags: ['unit', 'location'],
        testFn: async () => formatWeeklyHoursForWeb(undefined) === '',
    },

    // formatTimeForWeb — 12-hour conversion
    {
        name: 'formatTimeForWeb: 11:30 → 11:30 AM',
        tags: ['unit', 'location'],
        testFn: async () => formatTimeForWeb('11:30') === '11:30 AM',
    },
    {
        name: 'formatTimeForWeb: 12:00 → 12:00 PM',
        tags: ['unit', 'location'],
        testFn: async () => formatTimeForWeb('12:00') === '12:00 PM',
    },
    {
        name: 'formatTimeForWeb: 00:00 → 12:00 AM',
        tags: ['unit', 'location'],
        testFn: async () => formatTimeForWeb('00:00') === '12:00 AM',
    },
    {
        name: 'formatTimeForWeb: 21:30 → 9:30 PM',
        tags: ['unit', 'location'],
        testFn: async () => formatTimeForWeb('21:30') === '9:30 PM',
    },
    {
        name: 'formatTimeForWeb returns raw input for malformed string',
        tags: ['unit', 'location'],
        testFn: async () => formatTimeForWeb('bogus') === 'bogus',
    },

    // Static scripts
    {
        name: 'MENU_OVERVIEW_SCRIPT mentions dosa varieties',
        tags: ['unit', 'location'],
        testFn: async () => MENU_OVERVIEW_SCRIPT.includes('more than twenty varieties of dosa'),
    },
    {
        name: 'MENU_OVERVIEW_SCRIPT points to skbbellevue.com/menu',
        tags: ['unit', 'location'],
        testFn: async () => MENU_OVERVIEW_SCRIPT.includes('skbbellevue dot com slash menu'),
    },
    {
        name: 'MENU_OVERVIEW_SCRIPT includes last-orders times',
        tags: ['unit', 'location'],
        testFn: async () => MENU_OVERVIEW_SCRIPT.includes('2:10') && MENU_OVERVIEW_SCRIPT.includes('9:10'),
    },
    {
        name: 'HOURS_LOCATION_FALLBACK_SCRIPT mentions Bellevue Way',
        tags: ['unit', 'location'],
        testFn: async () => HOURS_LOCATION_FALLBACK_SCRIPT.includes('12 Bellevue Way SE'),
    },
    {
        name: 'HOURS_LOCATION_FALLBACK_SCRIPT says closed on Mondays',
        tags: ['unit', 'location'],
        testFn: async () => HOURS_LOCATION_FALLBACK_SCRIPT.includes("closed on Mondays"),
    },
];

runTests(cases, 'Location Template');
