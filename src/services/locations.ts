// ============================================================================
// SKB - Location management (multi-tenant)
// ============================================================================

import { getDb, locations } from '../core/db/mongo.js';
import type { Location } from '../types/queue.js';

export async function getLocation(locationId: string): Promise<Location | null> {
    const db = await getDb();
    return locations(db).findOne({ _id: locationId });
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
