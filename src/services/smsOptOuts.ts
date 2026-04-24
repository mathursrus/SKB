// ============================================================================
// SKB — SMS opt-out ledger (issue #69)
// ============================================================================
// Platform-wide opt-out storage. When a diner replies STOP to any tenant's
// SMS, we suppress all future sends to that phone across every tenant,
// because the underlying Twilio number is shared — carrier-level STOP
// blocks it anyway, so the app-side record exists to fail fast and keep
// logs clean.

import { getDb, smsOptOuts } from '../core/db/mongo.js';
import { normalizePhone } from '../utils/smsPhone.js';

export async function isOptedOut(phone: string): Promise<boolean> {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    const db = await getDb();
    const doc = await smsOptOuts(db).findOne({ phone: normalized });
    return !!doc;
}

export async function recordOptOut(phone: string, tenantHint?: string): Promise<void> {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const db = await getDb();
    const now = new Date();
    const tenants = tenantHint ? [tenantHint] : [];
    await smsOptOuts(db).updateOne(
        { phone: normalized },
        {
            $set: { phone: normalized, optedOutAt: now },
            $addToSet: { lastSeenTenants: { $each: tenants } },
        },
        { upsert: true },
    );
}

export async function clearOptOut(phone: string): Promise<void> {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    const db = await getDb();
    await smsOptOuts(db).deleteOne({ phone: normalized });
}
