// ============================================================================
// SKB - Location management (multi-tenant)
// ============================================================================

import { getDb, locations } from '../core/db/mongo.js';
import type {
    Location,
    VisitMode,
    LocationAddress,
    WeeklyHours,
    DayHours,
    DayOfWeek,
    PublicLocation,
} from '../types/queue.js';

const FRONT_DESK_PHONE_RE = /^\d{10}$/;
const MIN_VOICE_LARGE_PARTY_THRESHOLD = 6;
const MAX_VOICE_LARGE_PARTY_THRESHOLD = 20;

export async function getLocation(locationId: string): Promise<Location | null> {
    const db = await getDb();
    return locations(db).findOne({ _id: locationId });
}

/**
 * Project a Location into the public-safe subset. Excludes `pin` and any
 * operational internals. Used by the `/public-config` endpoint that powers
 * the new diner-facing website pages (issue #45).
 */
export function toPublicLocation(location: Location): PublicLocation {
    const out: PublicLocation = { name: location.name };
    if (location.address) out.address = location.address;
    if (location.hours) out.hours = location.hours;
    if (location.frontDeskPhone) out.frontDeskPhone = location.frontDeskPhone;
    if (location.publicUrl) out.publicUrl = location.publicUrl;
    return out;
}

const VALID_VISIT_MODES: VisitMode[] = ['auto', 'queue', 'menu', 'closed'];
const MAX_MENU_URL_LEN = 500;
const MAX_CLOSED_MESSAGE_LEN = 280;
const MAX_STREET_LEN = 120;
const MAX_CITY_LEN = 80;
const VALID_DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const US_STATE_RE = /^[A-Z]{2}$/;
const PUBLIC_HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

export interface VisitConfigUpdate {
    visitMode?: VisitMode;
    menuUrl?: string | null;        // null means clear the field
    closedMessage?: string | null;  // null means clear the field
}

export interface VoiceConfigUpdate {
    voiceEnabled?: boolean;
    frontDeskPhone?: string | null;
    voiceLargePartyThreshold?: number;
}

/**
 * Site configuration — the admin-configurable fields that power the
 * diner-facing website pages and the IVR hours/location branch (issue #45).
 *
 * Separate from VisitConfigUpdate (which routes the /r/:loc/visit door QR)
 * and VoiceConfigUpdate (which powers the IVR press-0 transfer + large-
 * party threshold). This split mirrors the "capability area" pattern
 * established by PR #42 / #48: one endpoint per concern, one save button
 * per card.
 */
export interface SiteConfigUpdate {
    address?: LocationAddress | null;
    hours?: WeeklyHours | null;
    publicHost?: string | null;
}

export function validateVoiceConfigUpdate(update: VoiceConfigUpdate): void {
    if (update.frontDeskPhone !== undefined && update.frontDeskPhone !== null && update.frontDeskPhone !== '') {
        const phone = String(update.frontDeskPhone).trim();
        if (!FRONT_DESK_PHONE_RE.test(phone)) {
            throw new Error('frontDeskPhone must be a 10-digit phone number');
        }
    }
    if (update.voiceLargePartyThreshold !== undefined) {
        const threshold = Number(update.voiceLargePartyThreshold);
        if (!Number.isInteger(threshold) || threshold < MIN_VOICE_LARGE_PARTY_THRESHOLD || threshold > MAX_VOICE_LARGE_PARTY_THRESHOLD) {
            throw new Error(`voiceLargePartyThreshold must be an integer in [${MIN_VOICE_LARGE_PARTY_THRESHOLD}, ${MAX_VOICE_LARGE_PARTY_THRESHOLD}]`);
        }
    }
}

function validateAddress(addr: LocationAddress): void {
    const street = (addr.street ?? '').trim();
    const city = (addr.city ?? '').trim();
    const state = (addr.state ?? '').trim().toUpperCase();
    const zip = (addr.zip ?? '').trim();
    if (!street) throw new Error('address.street is required');
    if (street.length > MAX_STREET_LEN) throw new Error(`address.street must be <= ${MAX_STREET_LEN} chars`);
    if (!city) throw new Error('address.city is required');
    if (city.length > MAX_CITY_LEN) throw new Error(`address.city must be <= ${MAX_CITY_LEN} chars`);
    if (!US_STATE_RE.test(state)) throw new Error('address.state must be a 2-letter US state code');
    if (zip && !ZIP_RE.test(zip)) throw new Error('address.zip must be 5 digits or 5-4 format');
}

function validateDayHours(day: DayOfWeek, value: DayHours | 'closed'): void {
    if (value === 'closed') return;
    if (typeof value !== 'object' || value === null) {
        throw new Error(`hours.${day} must be "closed" or an object with lunch/dinner`);
    }
    const windows: Array<['lunch' | 'dinner', { open: string; close: string } | undefined]> = [
        ['lunch', value.lunch],
        ['dinner', value.dinner],
    ];
    let any = false;
    for (const [label, win] of windows) {
        if (win === undefined) continue;
        any = true;
        if (typeof win.open !== 'string' || !TIME_RE.test(win.open)) {
            throw new Error(`hours.${day}.${label}.open must be HH:mm (24h)`);
        }
        if (typeof win.close !== 'string' || !TIME_RE.test(win.close)) {
            throw new Error(`hours.${day}.${label}.close must be HH:mm (24h)`);
        }
        if (win.open >= win.close) {
            throw new Error(`hours.${day}.${label}.open must be earlier than close`);
        }
    }
    if (!any) {
        throw new Error(`hours.${day} must include at least one of lunch or dinner (or be "closed")`);
    }
}

function validateHours(hours: WeeklyHours): void {
    for (const day of Object.keys(hours) as DayOfWeek[]) {
        if (!VALID_DAYS.includes(day)) {
            throw new Error(`hours: unknown day "${day}" (must be one of ${VALID_DAYS.join(', ')})`);
        }
        const value = hours[day];
        if (value === undefined) continue;
        validateDayHours(day, value);
    }
}

/**
 * Pure validator for a SiteConfigUpdate payload. Throws on invalid input.
 * Exported for unit testing — the full `updateLocationSiteConfig` function
 * also calls DB I/O which needs integration-level setup.
 */
export function validateSiteConfigUpdate(update: SiteConfigUpdate): void {
    if (update.address !== undefined && update.address !== null) {
        validateAddress(update.address);
    }
    if (update.hours !== undefined && update.hours !== null) {
        validateHours(update.hours);
    }
    if (update.publicHost !== undefined && update.publicHost !== null && update.publicHost !== '') {
        const h = String(update.publicHost).trim().toLowerCase();
        if (!PUBLIC_HOST_RE.test(h)) {
            throw new Error('publicHost must be a bare domain like "skbbellevue.com"');
        }
    }
}

/**
 * Update the visit-page routing config on a Location. Only the fields
 * explicitly present on `update` are touched; everything else is left
 * alone. Pass `null` to clear an optional string field.
 *
 * Validation:
 *  - visitMode must be one of the four allowed values.
 *  - menuUrl must be an https:// or http:// URL under 500 chars.
 *  - closedMessage must be 1..280 chars (Twitter-ish, fits in a phone screen).
 *
 * Returns the updated Location.
 */
export async function updateLocationVisitConfig(
    locationId: string,
    update: VisitConfigUpdate,
): Promise<Location> {
    if (update.visitMode !== undefined && !VALID_VISIT_MODES.includes(update.visitMode)) {
        throw new Error(`visitMode must be one of: ${VALID_VISIT_MODES.join(', ')}`);
    }
    if (update.menuUrl !== undefined && update.menuUrl !== null && update.menuUrl !== '') {
        const u = String(update.menuUrl).trim();
        if (u.length > MAX_MENU_URL_LEN) {
            throw new Error(`menuUrl must be <= ${MAX_MENU_URL_LEN} chars`);
        }
        if (!/^https?:\/\//i.test(u)) {
            throw new Error('menuUrl must be an http:// or https:// URL');
        }
    }
    if (update.closedMessage !== undefined && update.closedMessage !== null && update.closedMessage !== '') {
        const m = String(update.closedMessage).trim();
        if (m.length === 0 || m.length > MAX_CLOSED_MESSAGE_LEN) {
            throw new Error(`closedMessage must be 1..${MAX_CLOSED_MESSAGE_LEN} chars`);
        }
    }

    const db = await getDb();
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    if (update.visitMode !== undefined) $set.visitMode = update.visitMode;
    if (update.menuUrl !== undefined) {
        const u = update.menuUrl === null ? '' : String(update.menuUrl).trim();
        if (u === '') $unset.menuUrl = '';
        else $set.menuUrl = u;
    }
    if (update.closedMessage !== undefined) {
        const m = update.closedMessage === null ? '' : String(update.closedMessage).trim();
        if (m === '') $unset.closedMessage = '';
        else $set.closedMessage = m;
    }

    const updateDoc: Record<string, unknown> = {};
    if (Object.keys($set).length > 0) updateDoc.$set = $set;
    if (Object.keys($unset).length > 0) updateDoc.$unset = $unset;
    if (Object.keys(updateDoc).length === 0) {
        const existing = await getLocation(locationId);
        if (!existing) throw new Error('location not found');
        return existing;
    }
    const result = await locations(db).findOneAndUpdate(
        { _id: locationId },
        updateDoc,
        { returnDocument: 'after' },
    );
    if (!result) throw new Error('location not found');
    return result;
}

export async function updateLocationVoiceConfig(
    locationId: string,
    update: VoiceConfigUpdate,
): Promise<Location> {
    validateVoiceConfigUpdate(update);

    const db = await getDb();
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    if (update.voiceEnabled !== undefined) {
        $set.voiceEnabled = Boolean(update.voiceEnabled);
    }
    if (update.frontDeskPhone !== undefined) {
        const phone = update.frontDeskPhone === null ? '' : String(update.frontDeskPhone).trim();
        if (phone === '') $unset.frontDeskPhone = '';
        else $set.frontDeskPhone = phone;
    }
    if (update.voiceLargePartyThreshold !== undefined) {
        $set.voiceLargePartyThreshold = Number(update.voiceLargePartyThreshold);
    }

    const updateDoc: Record<string, unknown> = {};
    if (Object.keys($set).length > 0) updateDoc.$set = $set;
    if (Object.keys($unset).length > 0) updateDoc.$unset = $unset;
    if (Object.keys(updateDoc).length === 0) {
        const existing = await getLocation(locationId);
        if (!existing) throw new Error('location not found');
        return existing;
    }

    const result = await locations(db).findOneAndUpdate(
        { _id: locationId },
        updateDoc,
        { returnDocument: 'after' },
    );
    if (!result) throw new Error('location not found');
    return result;
}

/**
 * Update the site config on a Location (address, weekly hours, public host).
 *
 * Separate from updateLocationVisitConfig (door-QR routing) and
 * updateLocationVoiceConfig (IVR phone settings) to match the "one
 * capability area per function" pattern. Fields not present on `update` are
 * left alone; `null` clears the field.
 */
export async function updateLocationSiteConfig(
    locationId: string,
    update: SiteConfigUpdate,
): Promise<Location> {
    validateSiteConfigUpdate(update);

    const db = await getDb();
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    if (update.address !== undefined) {
        if (update.address === null) $unset.address = '';
        else {
            $set.address = {
                street: update.address.street.trim(),
                city: update.address.city.trim(),
                state: update.address.state.trim().toUpperCase(),
                zip: update.address.zip.trim(),
            };
        }
    }
    if (update.hours !== undefined) {
        if (update.hours === null) $unset.hours = '';
        else $set.hours = update.hours;
    }
    if (update.publicHost !== undefined) {
        const h = update.publicHost === null ? '' : String(update.publicHost).trim().toLowerCase();
        if (h === '') $unset.publicHost = '';
        else $set.publicHost = h;
    }

    const updateDoc: Record<string, unknown> = {};
    if (Object.keys($set).length > 0) updateDoc.$set = $set;
    if (Object.keys($unset).length > 0) updateDoc.$unset = $unset;
    if (Object.keys(updateDoc).length === 0) {
        const existing = await getLocation(locationId);
        if (!existing) throw new Error('location not found');
        return existing;
    }

    const result = await locations(db).findOneAndUpdate(
        { _id: locationId },
        updateDoc,
        { returnDocument: 'after' },
    );
    if (!result) throw new Error('location not found');
    return result;
}

export async function listLocations(): Promise<Location[]> {
    const db = await getDb();
    return locations(db).find().sort({ _id: 1 }).toArray();
}

export async function createLocation(
    id: string,
    name: string,
    pin: string,
): Promise<Location> {
    const db = await getDb();
    const loc: Location = { _id: id, name, pin, createdAt: new Date() };
    await locations(db).insertOne(loc);
    return loc;
}

export async function ensureLocation(
    id: string,
    name: string,
    pin: string,
): Promise<Location> {
    const existing = await getLocation(id);
    if (existing) return existing;
    return createLocation(id, name, pin);
}
