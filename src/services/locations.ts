// ============================================================================
// SKB - Location management (multi-tenant)
// ============================================================================

import { getDb, locations } from '../core/db/mongo.js';
import type { Location, VisitMode } from '../types/queue.js';

export async function getLocation(locationId: string): Promise<Location | null> {
    const db = await getDb();
    return locations(db).findOne({ _id: locationId });
}

const VALID_VISIT_MODES: VisitMode[] = ['auto', 'queue', 'menu', 'closed'];
const MAX_MENU_URL_LEN = 500;
const MAX_CLOSED_MESSAGE_LEN = 280;

export interface VisitConfigUpdate {
    visitMode?: VisitMode;
    menuUrl?: string | null;        // null means clear the field
    closedMessage?: string | null;  // null means clear the field
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
