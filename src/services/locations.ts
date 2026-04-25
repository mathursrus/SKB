// ============================================================================
// SKB - Location management (multi-tenant)
// ============================================================================

import { getDb, locations } from '../core/db/mongo.js';
import { SERVICE_WINDOW_KEYS } from '../types/queue.js';
import type {
    Location,
    VisitMode,
    LocationAddress,
    WeeklyHours,
    DayHours,
    DayOfWeek,
    ServiceWindowKey,
    GuestFeatures,
    PublicLocation,
    WebsiteTemplateKey,
    LocationContent,
    LocationKnownForItem,
    LocationMenu,
    MenuSection,
    MenuItem,
} from '../types/queue.js';

const FRONT_DESK_PHONE_RE = /^\d{10}$/;

/**
 * Normalize a user-entered US phone to a bare 10-digit string.
 * Accepts common inputs: `2065551234`, `(206) 555-1234`, `206-555-1234`,
 * `+1 206-555-1234`, `+1 (206) 555 1234`. Strips everything non-numeric,
 * then drops a leading `1` if the remaining length is 11 (US country code).
 * Returns the normalized 10-digit string, or `null` if the input can't be
 * coerced into one (so the validator can surface the error).
 */
export function normalizeFrontDeskPhone(input: string): string | null {
    const digits = input.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    if (digits.length === 10) return digits;
    return null;
}
const MIN_VOICE_LARGE_PARTY_THRESHOLD = 6;
const MAX_VOICE_LARGE_PARTY_THRESHOLD = 20;
export const DEFAULT_GUEST_FEATURES: GuestFeatures = {
    menu: true,
    sms: true,
    chat: true,
    order: true,
};

export function getGuestFeatures(location?: Pick<Location, 'guestFeatures'> | null): GuestFeatures {
    return {
        menu: location?.guestFeatures?.menu !== false,
        sms: location?.guestFeatures?.sms !== false,
        chat: location?.guestFeatures?.chat !== false,
        order: location?.guestFeatures?.order !== false,
    };
}

export async function getLocation(locationId: string): Promise<Location | null> {
    const db = await getDb();
    return locations(db).findOne({ _id: locationId });
}

/**
 * Project a Location into the public-safe subset. Excludes `pin` and any
 * operational internals. Used by the `/public-config` endpoint that powers
 * the new diner-facing website pages (issue #45 + issue #56 template fields).
 */
export function toPublicLocation(location: Location): PublicLocation {
    const out: PublicLocation = { name: location.name };
    if (location.address) out.address = location.address;
    if (location.hours) out.hours = location.hours;
    if (location.frontDeskPhone) out.frontDeskPhone = location.frontDeskPhone;
    if (location.publicUrl) out.publicUrl = location.publicUrl;
    if (location.websiteTemplate) out.websiteTemplate = location.websiteTemplate;
    if (location.content) out.content = location.content;
    out.guestFeatures = getGuestFeatures(location);
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
    cateringPhone?: string | null;
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

export interface GuestFeaturesUpdate {
    menu?: boolean;
    sms?: boolean;
    chat?: boolean;
    order?: boolean;
}

/**
 * Messaging config — the per-tenant display name prefixed onto every
 * outbound SMS on the shared OSH number (issue #69). Separate from
 * VoiceConfigUpdate because voice uses a per-tenant dedicated long code
 * while SMS uses the shared toll-free; the two live at different times
 * in the onboarding flow.
 *
 * `smsSenderName` is the only editable field today. The twilioVoiceNumber
 * is operator-provisioned and surfaced as read-only in the admin UI.
 */
export interface MessagingConfigUpdate {
    smsSenderName?: string | null;
}

const SMS_SENDER_NAME_MAX = 30;
// ASCII letters, digits, spaces, and the small set of punctuation that
// carriers reliably pass through without mangling (ampersand, hyphen,
// apostrophe, period). No emoji, no extended Unicode — both Twilio's
// Toll-Free Verification review and carrier filters treat those as red
// flags for spam.
const SMS_SENDER_NAME_RE = /^[A-Za-z0-9 &'.\-]+$/;

export function validateMessagingConfigUpdate(update: MessagingConfigUpdate): void {
    if (update.smsSenderName !== undefined && update.smsSenderName !== null) {
        const raw = String(update.smsSenderName);
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
            throw new Error('smsSenderName must not be blank (use null to clear)');
        }
        if (trimmed.length > SMS_SENDER_NAME_MAX) {
            throw new Error(`smsSenderName must be ${SMS_SENDER_NAME_MAX} characters or fewer`);
        }
        if (!SMS_SENDER_NAME_RE.test(trimmed)) {
            throw new Error('smsSenderName may only contain letters, numbers, spaces, and basic punctuation');
        }
    }
}

export async function updateLocationMessagingConfig(
    locationId: string,
    update: MessagingConfigUpdate,
): Promise<Location> {
    validateMessagingConfigUpdate(update);

    const db = await getDb();
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    if (update.smsSenderName !== undefined) {
        if (update.smsSenderName === null) {
            $unset.smsSenderName = '';
        } else {
            $set.smsSenderName = String(update.smsSenderName).trim();
        }
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

export function validateVoiceConfigUpdate(update: VoiceConfigUpdate): void {
    if (update.frontDeskPhone !== undefined && update.frontDeskPhone !== null && update.frontDeskPhone !== '') {
        const phone = String(update.frontDeskPhone).trim();
        // Accept common US formats — "+1 (206) 555-1234", "206-555-1234",
        // "206 555 1234" — by normalizing to bare 10 digits first.
        const normalized = normalizeFrontDeskPhone(phone) ?? phone;
        if (!FRONT_DESK_PHONE_RE.test(normalized)) {
            throw new Error('frontDeskPhone must be a 10-digit US phone number');
        }
    }
    if (update.cateringPhone !== undefined && update.cateringPhone !== null && update.cateringPhone !== '') {
        const phone = String(update.cateringPhone).trim();
        const normalized = normalizeFrontDeskPhone(phone) ?? phone;
        if (!FRONT_DESK_PHONE_RE.test(normalized)) {
            throw new Error('cateringPhone must be a 10-digit US phone number');
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
        throw new Error(`hours.${day} must be "closed" or an object with service windows`);
    }
    const windows = SERVICE_WINDOW_KEYS.map((label): [ServiceWindowKey, { open: string; close: string } | undefined] => [
        label,
        value[label],
    ]);
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
        throw new Error(`hours.${day} must include at least one service window (or be "closed")`);
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

export function validateGuestFeaturesUpdate(update: GuestFeaturesUpdate): void {
    const keys: Array<keyof GuestFeaturesUpdate> = ['menu', 'sms', 'chat', 'order'];
    for (const key of keys) {
        const value = update[key];
        if (value !== undefined && typeof value !== 'boolean') {
            throw new Error(`guestFeatures.${key} must be a boolean`);
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
        const raw = update.frontDeskPhone === null ? '' : String(update.frontDeskPhone).trim();
        if (raw === '') $unset.frontDeskPhone = '';
        else $set.frontDeskPhone = normalizeFrontDeskPhone(raw) ?? raw;
    }
    if (update.cateringPhone !== undefined) {
        const raw = update.cateringPhone === null ? '' : String(update.cateringPhone).trim();
        if (raw === '') $unset.cateringPhone = '';
        else $set.cateringPhone = normalizeFrontDeskPhone(raw) ?? raw;
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

export async function updateLocationGuestFeatures(
    locationId: string,
    update: GuestFeaturesUpdate,
): Promise<Location> {
    validateGuestFeaturesUpdate(update);
    const nextFeatures: GuestFeatures = {
        ...DEFAULT_GUEST_FEATURES,
        ...update,
    };
    if (nextFeatures.order) nextFeatures.menu = true;

    const db = await getDb();
    const result = await locations(db).findOneAndUpdate(
        { _id: locationId },
        {
            $set: { guestFeatures: nextFeatures },
        },
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

// ============================================================================
// Website config (issue #56) — template choice + structured content overrides
// ============================================================================
// Paired validator + updater. The validator is pure (unit-testable); the
// updater calls Mongo. Follows the SiteConfig pattern established in #45.
//
// Size limits are deliberately generous for a hospitality site — "about" is
// room for ~2 short paragraphs, hero/sub are single-line, and knownFor is
// capped at 3 items per the spec §7 mock layout.
// ============================================================================

export const VALID_WEBSITE_TEMPLATES: readonly WebsiteTemplateKey[] = ['saffron', 'slate'];
export const DEFAULT_WEBSITE_TEMPLATE: WebsiteTemplateKey = 'saffron';

export const MAX_HERO_HEADLINE_LEN = 120;
export const MAX_HERO_SUBHEAD_LEN = 200;
export const MAX_ABOUT_LEN = 2000;
export const MAX_RESERVATIONS_NOTE_LEN = 200;
export const MAX_INSTAGRAM_HANDLE_LEN = 32; // Instagram's own limit is 30
export const MAX_CONTACT_EMAIL_LEN = 254;   // RFC 5321
export const MAX_KNOWN_FOR_ITEMS = 3;
export const MAX_KNOWN_FOR_TITLE_LEN = 60;
export const MAX_KNOWN_FOR_DESC_LEN = 160;
export const MAX_KNOWN_FOR_IMAGE_LEN = 500;

// Simple pragmatic email matcher (full RFC validation is not worth its weight).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface WebsiteConfigUpdate {
    websiteTemplate?: WebsiteTemplateKey | null;
    content?: LocationContent | null;
}

function checkLen(value: unknown, max: number, label: string): void {
    if (value === undefined || value === null) return;
    if (typeof value !== 'string') throw new Error(`${label} must be a string`);
    if (value.length > max) throw new Error(`${label} must be <= ${max} chars`);
}

function validateKnownFor(items: unknown, label = 'knownFor'): void {
    if (items === undefined || items === null) return;
    if (!Array.isArray(items)) throw new Error(`${label} must be an array`);
    if (items.length > MAX_KNOWN_FOR_ITEMS) {
        throw new Error(`${label} supports at most ${MAX_KNOWN_FOR_ITEMS} items`);
    }
    items.forEach((raw, i) => {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            throw new Error(`${label}[${i}] must be an object`);
        }
        const item = raw as Record<string, unknown>;
        checkLen(item.title, MAX_KNOWN_FOR_TITLE_LEN, `${label}[${i}].title`);
        checkLen(item.desc, MAX_KNOWN_FOR_DESC_LEN, `${label}[${i}].desc`);
        checkLen(item.image, MAX_KNOWN_FOR_IMAGE_LEN, `${label}[${i}].image`);
    });
}

/**
 * Pure validator for a Website-tab save. Throws on invalid input. Exported
 * for unit testing; the DB-touching wrapper lives below.
 *
 * Semantics:
 *  - `websiteTemplate: null` is an explicit reset to the default (saffron).
 *  - `content: null` clears all overrides (falls back entirely to template
 *    defaults).
 *  - Individual content fields set to '' are allowed (user clearing just
 *    one override). The updater treats empty strings as "unset this field"
 *    so rendered output falls back to the template default.
 */
export function validateWebsiteConfigUpdate(update: WebsiteConfigUpdate): void {
    if (update.websiteTemplate !== undefined && update.websiteTemplate !== null) {
        if (!(VALID_WEBSITE_TEMPLATES as readonly string[]).includes(String(update.websiteTemplate))) {
            throw new Error(`websiteTemplate must be one of: ${VALID_WEBSITE_TEMPLATES.join(', ')}`);
        }
    }
    if (update.content !== undefined && update.content !== null) {
        const c = update.content;
        checkLen(c.heroHeadline, MAX_HERO_HEADLINE_LEN, 'heroHeadline');
        checkLen(c.heroSubhead, MAX_HERO_SUBHEAD_LEN, 'heroSubhead');
        checkLen(c.about, MAX_ABOUT_LEN, 'about');
        checkLen(c.reservationsNote, MAX_RESERVATIONS_NOTE_LEN, 'reservationsNote');
        checkLen(c.instagramHandle, MAX_INSTAGRAM_HANDLE_LEN, 'instagramHandle');
        checkLen(c.contactEmail, MAX_CONTACT_EMAIL_LEN, 'contactEmail');
        if (c.contactEmail !== undefined && c.contactEmail !== null && c.contactEmail !== '') {
            if (!EMAIL_RE.test(String(c.contactEmail))) {
                throw new Error('contactEmail must be a valid email address');
            }
        }
        validateKnownFor(c.knownFor);
    }
}

function normalizeContent(input: LocationContent): LocationContent {
    // Preserve only the fields that have a non-empty value; drop empty strings
    // so the renderer falls back to template defaults for those fields.
    const out: LocationContent = {};
    const strFields: (keyof LocationContent)[] = [
        'heroHeadline', 'heroSubhead', 'about', 'contactEmail', 'instagramHandle', 'reservationsNote',
    ];
    for (const k of strFields) {
        const v = input[k];
        if (typeof v === 'string' && v.trim() !== '') {
            (out as Record<string, unknown>)[k] = v.trim();
        }
    }
    if (Array.isArray(input.knownFor)) {
        const items: LocationKnownForItem[] = [];
        for (const raw of input.knownFor) {
            if (!raw || typeof raw !== 'object') continue;
            const item: LocationKnownForItem = {
                title: String(raw.title ?? '').trim(),
                desc: String(raw.desc ?? '').trim(),
                image: String(raw.image ?? '').trim(),
            };
            if (item.title || item.desc || item.image) items.push(item);
        }
        if (items.length > 0) out.knownFor = items;
    }
    return out;
}

/**
 * Update the website-tab config on a Location (template + structured content).
 * Follows the `updateLocation*Config` pattern established in #45: fields not
 * present on `update` are left alone; `null` clears the field entirely.
 */
export async function updateLocationWebsiteConfig(
    locationId: string,
    update: WebsiteConfigUpdate,
): Promise<Location> {
    validateWebsiteConfigUpdate(update);

    const db = await getDb();
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    if (update.websiteTemplate !== undefined) {
        if (update.websiteTemplate === null) $unset.websiteTemplate = '';
        else $set.websiteTemplate = update.websiteTemplate;
    }
    if (update.content !== undefined) {
        if (update.content === null) {
            $unset.content = '';
        } else {
            const normalized = normalizeContent(update.content);
            if (Object.keys(normalized).length === 0) {
                $unset.content = '';
            } else {
                $set.content = normalized;
            }
        }
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

// ----------------------------------------------------------------------------
// Structured menu (issue #51 follow-up)
// ----------------------------------------------------------------------------
// Sections + items, authored by the owner in the Menu tab. The public /menu
// route reads this directly; the legacy `menuUrl` still works as an
// external-link alternative (owner who keeps their menu as a PDF etc).

const MENU_MAX_SECTIONS = 20;
const MENU_MAX_ITEMS_PER_SECTION = 60;
const MENU_MAX_TITLE = 80;
const MENU_MAX_NAME = 120;
const MENU_MAX_DESC = 500;
const MENU_MAX_PRICE = 40;
const MENU_MAX_IMAGE = 500;
const MENU_MAX_INGREDIENTS = 16;
const MENU_MAX_INGREDIENT_LEN = 60;
const VALID_MENU_AVAILABILITY = ['available', 'sold_out'] as const;

function validateIngredientList(
    value: unknown,
    label: string,
): asserts value is string[] | undefined {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
    if (value.length > MENU_MAX_INGREDIENTS) {
        throw new Error(`${label} must be <= ${MENU_MAX_INGREDIENTS} items`);
    }
    for (const [index, item] of value.entries()) {
        if (typeof item !== 'string') throw new Error(`${label}[${index}] must be a string`);
        if (item.trim().length === 0) throw new Error(`${label}[${index}] is required`);
        if (item.trim().length > MENU_MAX_INGREDIENT_LEN) {
            throw new Error(`${label}[${index}] must be <= ${MENU_MAX_INGREDIENT_LEN} chars`);
        }
    }
}

export function validateMenu(menu: LocationMenu): void {
    if (!menu || !Array.isArray(menu.sections)) {
        throw new Error('menu.sections must be an array');
    }
    if (menu.sections.length > MENU_MAX_SECTIONS) {
        throw new Error(`menu.sections must be <= ${MENU_MAX_SECTIONS}`);
    }
    const seenSectionIds = new Set<string>();
    for (const s of menu.sections) {
        if (!s || typeof s.id !== 'string' || s.id.length === 0 || s.id.length > 40) {
            throw new Error('section.id must be a non-empty string (<= 40 chars)');
        }
        if (seenSectionIds.has(s.id)) throw new Error(`section.id duplicate: ${s.id}`);
        seenSectionIds.add(s.id);
        if (typeof s.title !== 'string' || s.title.trim().length === 0) {
            throw new Error('section.title is required');
        }
        if (s.title.length > MENU_MAX_TITLE) {
            throw new Error(`section.title must be <= ${MENU_MAX_TITLE} chars`);
        }
        if (!Array.isArray(s.items)) throw new Error('section.items must be an array');
        if (s.items.length > MENU_MAX_ITEMS_PER_SECTION) {
            throw new Error(`section.items must be <= ${MENU_MAX_ITEMS_PER_SECTION}`);
        }
        const seenItemIds = new Set<string>();
        for (const it of s.items) {
            if (!it || typeof it.id !== 'string' || it.id.length === 0 || it.id.length > 40) {
                throw new Error('item.id must be a non-empty string (<= 40 chars)');
            }
            if (seenItemIds.has(it.id)) throw new Error(`item.id duplicate in section ${s.id}: ${it.id}`);
            seenItemIds.add(it.id);
            if (typeof it.name !== 'string' || it.name.trim().length === 0) {
                throw new Error('item.name is required');
            }
            if (it.name.length > MENU_MAX_NAME) {
                throw new Error(`item.name must be <= ${MENU_MAX_NAME} chars`);
            }
            if (it.description !== undefined && it.description !== null) {
                if (typeof it.description !== 'string') throw new Error('item.description must be a string');
                if (it.description.length > MENU_MAX_DESC) {
                    throw new Error(`item.description must be <= ${MENU_MAX_DESC} chars`);
                }
            }
            if (it.price !== undefined && it.price !== null) {
                if (typeof it.price !== 'string') throw new Error('item.price must be a string');
                if (it.price.length > MENU_MAX_PRICE) {
                    throw new Error(`item.price must be <= ${MENU_MAX_PRICE} chars`);
                }
            }
            if (it.image !== undefined && it.image !== null) {
                if (typeof it.image !== 'string') throw new Error('item.image must be a string');
                if (it.image.length > MENU_MAX_IMAGE) {
                    throw new Error(`item.image must be <= ${MENU_MAX_IMAGE} chars`);
                }
            }
            if (it.availability !== undefined && it.availability !== null) {
                if (!(VALID_MENU_AVAILABILITY as readonly string[]).includes(it.availability)) {
                    throw new Error(`item.availability must be one of: ${VALID_MENU_AVAILABILITY.join(', ')}`);
                }
            }
            validateIngredientList(it.requiredIngredients, 'item.requiredIngredients');
            validateIngredientList(it.optionalIngredients, 'item.optionalIngredients');
        }
    }
}

function normalizeIngredientList(items: string[] | undefined): string[] | undefined {
    if (!Array.isArray(items)) return undefined;
    const cleaned = items
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
}

/** Normalize for storage: trim strings, drop empty description/price. */
function normalizeMenu(menu: LocationMenu): LocationMenu {
    return {
        sections: menu.sections.map((s): MenuSection => ({
            id: s.id,
            title: s.title.trim(),
            items: s.items.map((it): MenuItem => {
                const out: MenuItem = { id: it.id, name: it.name.trim() };
                const d = typeof it.description === 'string' ? it.description.trim() : '';
                if (d) out.description = d;
                const p = typeof it.price === 'string' ? it.price.trim() : '';
                if (p) out.price = p;
                const image = typeof it.image === 'string' ? it.image.trim() : '';
                if (image) out.image = image;
                if (it.availability === 'sold_out') out.availability = 'sold_out';
                const requiredIngredients = normalizeIngredientList(it.requiredIngredients);
                if (requiredIngredients) out.requiredIngredients = requiredIngredients;
                const optionalIngredients = normalizeIngredientList(it.optionalIngredients);
                if (optionalIngredients) out.optionalIngredients = optionalIngredients;
                return out;
            }),
        })),
        updatedAt: new Date(),
    };
}

/**
 * Replace the entire menu for a location. `null` drops the field (revert
 * to the "no structured menu / menuUrl fallback" state).
 */
export async function updateLocationMenu(
    locationId: string,
    menu: LocationMenu | null,
): Promise<Location> {
    const db = await getDb();
    const updateDoc: Record<string, unknown> = {};
    if (menu === null) {
        updateDoc.$unset = { menu: '' };
    } else {
        validateMenu(menu);
        updateDoc.$set = { menu: normalizeMenu(menu) };
    }
    const result = await locations(db).findOneAndUpdate(
        { _id: locationId },
        updateDoc,
        { returnDocument: 'after' },
    );
    if (!result) throw new Error('location not found');
    return result;
}
