// ============================================================================
// SKB - Settings service (avgTurnTimeMinutes) — multi-tenant
// ============================================================================

import { getDb, settings as settingsColl } from '../core/db/mongo.js';

export const DEFAULT_AVG_TURN_TIME_MINUTES = 8;
export const MIN_AVG_TURN_TIME = 1;
export const MAX_AVG_TURN_TIME = 60;

export async function getAvgTurnTime(locationId: string): Promise<number> {
    const db = await getDb();
    const doc = await settingsColl(db).findOne({ _id: locationId });
    if (!doc) return DEFAULT_AVG_TURN_TIME_MINUTES;
    return doc.avgTurnTimeMinutes;
}

export async function setAvgTurnTime(locationId: string, minutes: number): Promise<number> {
    if (
        !Number.isInteger(minutes) ||
        minutes < MIN_AVG_TURN_TIME ||
        minutes > MAX_AVG_TURN_TIME
    ) {
        throw new Error(
            `avgTurnTimeMinutes must be an integer in [${MIN_AVG_TURN_TIME}, ${MAX_AVG_TURN_TIME}]`,
        );
    }
    const db = await getDb();
    await settingsColl(db).updateOne(
        { _id: locationId },
        { $set: { _id: locationId, avgTurnTimeMinutes: minutes, updatedAt: new Date() } },
        { upsert: true },
    );
    return minutes;
}
