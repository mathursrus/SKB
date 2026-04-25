// ============================================================================
// SKB — Location template helpers (pure functions)
// ============================================================================
// Pure formatters for rendering a Location's admin-configurable fields into
// web HTML and into voice IVR speech. Isolated from I/O so they can be
// exercised in unit tests without a database or a live Twilio session.
//
// Used by:
//  - src/routes/voice.ts   (press 4 "hours & location" branch)
//  - public/home.html      (home page hours block, footer)
//  - public/hours-location.html (weekly hours table, address + map)
// ============================================================================

import { SERVICE_WINDOW_KEYS } from '../types/queue.js';
import type {
    LocationAddress,
    WeeklyHours,
    DayHours,
    DayOfWeek,
    ServiceWindowKey,
} from '../types/queue.js';

const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DAY_LABEL: Record<DayOfWeek, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
};

const SERVICE_LABEL: Record<ServiceWindowKey, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    special: 'Special',
    dinner: 'Dinner',
};

// US state abbreviation → full name (the set the restaurant actually needs).
// For anything not in this table, `formatAddressForSpeech` reads out the
// abbreviation letter-by-letter which is graceful enough.
const US_STATE_FULL: Record<string, string> = {
    WA: 'Washington',
    OR: 'Oregon',
    CA: 'California',
    NY: 'New York',
    TX: 'Texas',
    FL: 'Florida',
    IL: 'Illinois',
    MA: 'Massachusetts',
};

// ---------------------------------------------------------------------------
// Address formatters
// ---------------------------------------------------------------------------

/**
 * Render an address for the voice IVR.
 *
 *   "12 Bellevue Way SE in Bellevue, Washington"
 *
 * Intentionally omits the zip code (Twilio TTS mumbles 5-digit strings) and
 * expands the state abbreviation if we know it. Returns an empty string if
 * the address is falsy so callers can fall back to a static default.
 */
export function formatAddressForSpeech(address: LocationAddress | undefined | null): string {
    if (!address) return '';
    const street = (address.street ?? '').trim();
    const city = (address.city ?? '').trim();
    const stateCode = (address.state ?? '').trim().toUpperCase();
    const stateFull = US_STATE_FULL[stateCode] ?? stateCode;
    if (!street || !city) return '';
    if (!stateFull) return `${street} in ${city}`;
    return `${street} in ${city}, ${stateFull}`;
}

/**
 * Build a Google Maps embed URL for the given address. The embed iframe
 * renders a pin + interactive map without requiring a Maps API key.
 *
 *   https://www.google.com/maps?q=<url-encoded address>&output=embed
 */
export function buildGoogleMapsEmbedUrl(address: LocationAddress | undefined | null): string {
    if (!address) return '';
    const parts = [address.street, address.city, address.state, address.zip]
        .map(p => (p ?? '').trim())
        .filter(Boolean);
    if (parts.length < 2) return '';
    const q = encodeURIComponent(parts.join(', '));
    return `https://www.google.com/maps?q=${q}&output=embed`;
}

// ---------------------------------------------------------------------------
// Hours formatters
// ---------------------------------------------------------------------------

/**
 * Render the weekly hours for voice. Produces a short, speakable string:
 *
 *   "Tuesday through Sunday — we're closed on Mondays. Lunch service is
 *    from 11:30 AM to 2:30 PM. Dinner service is from 5:30 PM to 9:30 PM."
 *
 * Design choices:
 *  - Groups closed days into the "closed on X" phrase rather than reading
 *    each day individually, because IVR listeners can't scan a table.
 *  - Detects distinct contiguous schedules (e.g. weekdays vs weekends) so
 *    the spoken hours match the real configured service windows.
 *  - Returns an empty string if `hours` is falsy so callers can fall back
 *    to a static default.
 */
export function formatWeeklyHoursForSpeech(hours: WeeklyHours | undefined | null): string {
    if (!hours) return '';

    const openDays: DayOfWeek[] = [];
    const closedDays: DayOfWeek[] = [];
    for (const day of DAY_ORDER) {
        const entry = hours[day];
        if (entry === 'closed' || entry === undefined) {
            closedDays.push(day);
        } else {
            openDays.push(day);
        }
    }

    if (openDays.length === 0) return "We're temporarily closed. Please call back later.";

    const closedPhrase = closedDays.length === 0
        ? ''
        : ` We're closed on ${describeClosedDays(closedDays)}.`;
    const groups = groupScheduleDays(hours, openDays);
    const schedulePhrase = groups.length === 1
        ? `We're open ${describeOpenDays(openDays)}.${formatServiceWindowsForSpeech(groups[0].entry)}`
        : groups.map((group, index) => {
            const dayPhrase = describeDayGroup(group.days);
            const opener = index === 0
                ? `We're open ${group.days.length === 1 ? `on ${dayPhrase}` : dayPhrase}.`
                : ` We're also open ${group.days.length === 1 ? `on ${dayPhrase}` : dayPhrase}.`;
            return `${opener}${formatServiceWindowsForSpeech(group.entry)}`;
        }).join('');

    return `${schedulePhrase}${closedPhrase}`.trim();
}

// ---------------------------------------------------------------------------
// Internal time helpers
// ---------------------------------------------------------------------------

/** "11:30" → "11:30 AM", "17:30" → "5:30 PM", "00:00" → "12:00 AM". */
export function formatTimeForWeb(hhmm: string): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
    if (!m) return hhmm ?? '';
    const h = parseInt(m[1], 10);
    const mins = m[2];
    if (h === 0) return `12:${mins} AM`;
    if (h < 12) return `${h}:${mins} AM`;
    if (h === 12) return `12:${mins} PM`;
    return `${h - 12}:${mins} PM`;
}

/**
 * "11:30" → "11:30 AM" — Polly-safe speech form. Identical to
 * `formatTimeForWeb` for now; kept as a separate name so future speech-only
 * tweaks (like dropping ":00" for on-the-hour times) don't touch the web.
 */
export function formatTimeForSpeech(hhmm: string): string {
    return formatTimeForWeb(hhmm);
}

function describeOpenDays(openDays: DayOfWeek[]): string {
    if (openDays.length === 7) return 'seven days a week';
    // Detect a contiguous run starting at openDays[0]. If all open days
    // form one contiguous block, render as "X through Y".
    const indices = openDays.map(d => DAY_ORDER.indexOf(d)).sort((a, b) => a - b);
    const contiguous = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
    if (contiguous && openDays.length > 1) {
        const first = DAY_LABEL[DAY_ORDER[indices[0]]];
        const last = DAY_LABEL[DAY_ORDER[indices[indices.length - 1]]];
        return `${first} through ${last}`;
    }
    // Fallback: list individually. "only on Friday and Saturday" / "only on
    // Wednesday, Friday, and Sunday".
    const names = openDays.map(d => DAY_LABEL[d]);
    if (names.length === 1) return `only on ${names[0]}s`;
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function describeDayGroup(days: DayOfWeek[]): string {
    if (days.length === 1) return DAY_LABEL[days[0]];
    if (days.length === 2) return `${DAY_LABEL[days[0]]} and ${DAY_LABEL[days[1]]}`;
    const indices = days.map(d => DAY_ORDER.indexOf(d)).sort((a, b) => a - b);
    const contiguous = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
    if (contiguous) {
        const first = DAY_LABEL[DAY_ORDER[indices[0]]];
        const last = DAY_LABEL[DAY_ORDER[indices[indices.length - 1]]];
        return `${first} through ${last}`;
    }
    const names = days.map(d => DAY_LABEL[d]);
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function describeClosedDays(closedDays: DayOfWeek[]): string {
    const names = closedDays.map(d => `${DAY_LABEL[d]}s`);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function dayHoursSignature(entry: DayHours): string {
    return SERVICE_WINDOW_KEYS.map((key) => {
        const window = entry[key];
        return window ? `${key}:${window.open}-${window.close}` : `${key}:-`;
    }).join('|');
}

function groupScheduleDays(
    hours: WeeklyHours,
    openDays: DayOfWeek[],
): Array<{ days: DayOfWeek[]; entry: DayHours }> {
    const groups: Array<{ days: DayOfWeek[]; entry: DayHours }> = [];
    for (const day of openDays) {
        const entry = hours[day];
        if (!entry || entry === 'closed') continue;
        const signature = dayHoursSignature(entry);
        const last = groups[groups.length - 1];
        if (last && dayHoursSignature(last.entry) === signature) {
            last.days.push(day);
        } else {
            groups.push({ days: [day], entry });
        }
    }
    return groups;
}

function formatServiceWindowsForSpeech(entry: DayHours): string {
    let out = '';
    for (const key of SERVICE_WINDOW_KEYS as readonly ServiceWindowKey[]) {
        const window = entry[key];
        if (!window) continue;
        out += ` ${SERVICE_LABEL[key]} service is from ${formatTimeForSpeech(window.open)} to ${formatTimeForSpeech(window.close)}.`;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Static IVR scripts
// ---------------------------------------------------------------------------

/**
 * The static menu overview spoken on the press-3 IVR branch. Deliberately a
 * category overview, not an item-by-item read — reading 79 items by voice
 * would take minutes and is unusable. Callers who want item-level detail
 * are directed to the website.
 *
 * Includes the website URL for self-service item lookup and the last-orders
 * times because "when can I still come in?" is adjacent to "what's on the
 * menu?" and is a common reason to call.
 */
export const MENU_OVERVIEW_SCRIPT = [
    "We serve authentic South Indian cuisine.",
    "Our menu includes breakfast favorites like idly, vada, and pongal;",
    "more than twenty varieties of dosa including the classic masala dosa, spicy Mysore masala dosa, and our house-special paper roast;",
    "uthappams, rice dishes, thalis, and a full range of beverages and desserts.",
    "You can see the full menu with prices at skbbellevue dot com slash menu.",
    "Last orders for lunch are at 2:10 PM and last orders for dinner are at 9:10 PM.",
].join(' ');

// Fallback used when `location.hours` or `location.address` isn't configured
// yet. Matches the literal values confirmed by the owner in PR #47 review.
export const HOURS_LOCATION_FALLBACK_SCRIPT = [
    "We're located at 12 Bellevue Way SE in Bellevue, Washington.",
    "We're open Tuesday through Sunday — we're closed on Mondays.",
    "Lunch service is from 11:30 AM to 2:30 PM, with last orders at 2:10 PM.",
    "Dinner service is from 5:30 PM to 9:30 PM, with last orders at 9:10 PM.",
    "Complimentary parking is available in the lot at our building.",
].join(' ');
