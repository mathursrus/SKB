// ============================================================================
// SKB - Settings service (avgTurnTimeMinutes)
// ============================================================================

import { getDb, settings as settingsColl } from '../core/db/mongo.js';

export const DEFAULT_AVG_TURN_TIME_MINUTES = 8;
export const MIN_AVG_TURN_TIME = 1;
export const MAX_AVG_TURN_TIME = 60;

export async function getAvgTurnTime(): Promise<number> {
    const db = await getDb();
    const doc = await settingsColl(db).findOne({ _id: 'global' });
    if (!doc) return DEFAULT_AVG_TURN_TIME_MINUTES;
    return doc.avgTurnTimeMinutes;
}

export async function setAvgTurnTime(minutes: number): Promise<number> {
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
        { _id: 'global' },
        { $set: { _id: 'global', avgTurnTimeMinutes: minutes, updatedAt: new Date() } },
        { upsert: true },
    );
    return minutes;
}
