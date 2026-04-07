// ============================================================================
// SKB - Dining lifecycle service (advance, list dining/completed, timeline)
// ============================================================================
//
// Post-seated party lifecycle: seated -> ordered -> served -> checkout -> departed.
// Extracted from queue.ts to maintain single-responsibility per module.
// ============================================================================

import { ObjectId } from 'mongodb';

import { getDb, queueEntries } from '../core/db/mongo.js';
import { minutesBetween, serviceDay } from '../core/utils/time.js';
import type {
    HostCompletedDTO,
    HostCompletedPartyDTO,
    HostDiningDTO,
    HostDiningPartyDTO,
    PartyState,
    PartyTimelineDTO,
    QueueEntry,
} from '../types/queue.js';

// Parties currently dining (post-seated, pre-departed).
export const DINING_STATES: PartyState[] = ['seated', 'ordered', 'served', 'checkout'];

// Terminal states for the day's completed view.
export const COMPLETED_STATES: PartyState[] = ['departed', 'no_show'];

// Valid forward state order for advance transitions.
const STATE_ORDER: Record<string, number> = {
    seated: 1,
    ordered: 2,
    served: 3,
    checkout: 4,
    departed: 5,
};

// Map from target state to the timestamp field that should be set.
const STATE_TIMESTAMP_FIELD: Record<string, keyof QueueEntry> = {
    seated: 'seatedAt',
    ordered: 'orderedAt',
    served: 'servedAt',
    checkout: 'checkoutAt',
    departed: 'departedAt',
};

/**
 * Advance a dining party to the next (or a later) state in the lifecycle.
 * Valid forward transitions: seated -> ordered -> served -> checkout -> departed.
 * Skipping states is allowed (R5). Backward transitions are rejected.
 */
export async function advanceParty(
    id: string,
    targetState: string,
    now: Date = new Date(),
): Promise<{ ok: boolean }> {
    if (!(targetState in STATE_ORDER)) {
        throw new Error(`invalid target state: ${targetState}`);
    }
    const db = await getDb();
    let _id: ObjectId;
    try {
        _id = new ObjectId(id);
    } catch {
        throw new Error('invalid id');
    }

    const entry = await queueEntries(db).findOne({ _id });
    if (!entry) return { ok: false };

    const currentOrder = STATE_ORDER[entry.state];
    const targetOrder = STATE_ORDER[targetState];
    if (currentOrder === undefined || targetOrder === undefined) {
        throw new Error(`cannot advance from ${entry.state} to ${targetState}`);
    }
    if (targetOrder <= currentOrder) {
        throw new Error(`cannot advance backward from ${entry.state} to ${targetState}`);
    }

    const tsField = STATE_TIMESTAMP_FIELD[targetState];
    const update: Record<string, unknown> = {
        state: targetState,
        [tsField]: now,
    };

    // R13: departed parties set removedAt and removedReason for backward compat.
    if (targetState === 'departed') {
        update.removedAt = now;
        update.removedReason = 'departed';
    }

    const res = await queueEntries(db).updateOne(
        { _id },
        { $set: update },
    );
    return { ok: res.matchedCount === 1 };
}

/**
 * List all currently-dining parties for the Seated tab (R6, R7).
 */
export async function listDiningParties(now: Date = new Date()): Promise<HostDiningDTO> {
    const db = await getDb();
    const today = serviceDay(now);
    const docs = await queueEntries(db)
        .find({ serviceDay: today, state: { $in: DINING_STATES } })
        .sort({ joinedAt: 1 })
        .toArray();

    const parties: HostDiningPartyDTO[] = docs.map((d) => {
        const stateEnteredAt = getStateTimestamp(d, d.state) ?? d.seatedAt ?? d.joinedAt;
        const timeInStateMinutes = minutesBetween(stateEnteredAt, now);
        const totalTableMinutes = d.seatedAt ? minutesBetween(d.seatedAt, now) : 0;

        return {
            id: String(d._id ?? ''),
            name: d.name,
            partySize: d.partySize,
            phoneLast4: d.phoneLast4 ?? null,
            state: d.state as 'seated' | 'ordered' | 'served' | 'checkout',
            seatedAt: (d.seatedAt ?? d.joinedAt).toISOString(),
            timeInStateMinutes,
            totalTableMinutes,
        };
    });

    return { parties, diningCount: parties.length };
}

/**
 * List completed parties for the Complete tab (departed + no_show).
 */
export async function listCompletedParties(now: Date = new Date()): Promise<HostCompletedDTO> {
    const db = await getDb();
    const today = serviceDay(now);
    const docs = await queueEntries(db)
        .find({ serviceDay: today, state: { $in: COMPLETED_STATES } })
        .sort({ joinedAt: -1 })
        .toArray();

    let totalWaitSum = 0;
    let totalWaitCount = 0;
    let totalTableSum = 0;
    let totalTableCount = 0;

    const parties: HostCompletedPartyDTO[] = docs.map((d) => {
        const endTime = d.removedAt ?? now;
        const totalTimeMinutes = minutesBetween(d.joinedAt, endTime);

        let waitTimeMinutes: number;
        if (d.seatedAt) {
            waitTimeMinutes = minutesBetween(d.joinedAt, d.seatedAt);
        } else if (d.removedAt) {
            waitTimeMinutes = minutesBetween(d.joinedAt, d.removedAt);
        } else {
            waitTimeMinutes = 0;
        }

        let tableTimeMinutes: number | null = null;
        if (d.state === 'departed' && d.seatedAt && d.departedAt) {
            tableTimeMinutes = minutesBetween(d.seatedAt, d.departedAt);
            totalTableSum += tableTimeMinutes;
            totalTableCount++;
        }

        if (d.seatedAt) {
            totalWaitSum += waitTimeMinutes;
            totalWaitCount++;
        }

        return {
            id: String(d._id ?? ''),
            name: d.name,
            partySize: d.partySize,
            state: d.state,
            joinedAt: d.joinedAt.toISOString(),
            waitTimeMinutes,
            tableTimeMinutes,
            totalTimeMinutes,
        };
    });

    const totalServed = docs.filter((d) => d.state === 'departed').length;
    const totalNoShows = docs.filter((d) => d.state === 'no_show').length;

    return {
        parties,
        totalServed,
        totalNoShows,
        avgWaitMinutes: totalWaitCount > 0 ? Math.round(totalWaitSum / totalWaitCount) : null,
        avgTableOccupancyMinutes: totalTableCount > 0 ? Math.round(totalTableSum / totalTableCount) : null,
    };
}

/**
 * Get full timeline of state transitions for a party (R10a).
 */
export async function getPartyTimeline(
    id: string,
): Promise<PartyTimelineDTO | null> {
    const db = await getDb();
    let _id: ObjectId;
    try {
        _id = new ObjectId(id);
    } catch {
        throw new Error('invalid id');
    }

    const entry = await queueEntries(db).findOne({ _id });
    if (!entry) return null;

    return {
        id: String(entry._id ?? ''),
        name: entry.name,
        partySize: entry.partySize,
        state: entry.state,
        timestamps: {
            joinedAt: entry.joinedAt?.toISOString() ?? null,
            calledAt: entry.calls && entry.calls.length > 0 ? entry.calls[0].toISOString() : null,
            seatedAt: entry.seatedAt?.toISOString() ?? null,
            orderedAt: entry.orderedAt?.toISOString() ?? null,
            servedAt: entry.servedAt?.toISOString() ?? null,
            checkoutAt: entry.checkoutAt?.toISOString() ?? null,
            departedAt: entry.departedAt?.toISOString() ?? null,
        },
    };
}

/** Get the timestamp for when a party entered a given state. */
function getStateTimestamp(entry: QueueEntry, state: string): Date | undefined {
    switch (state) {
        case 'seated': return entry.seatedAt;
        case 'ordered': return entry.orderedAt;
        case 'served': return entry.servedAt;
        case 'checkout': return entry.checkoutAt;
        case 'departed': return entry.departedAt;
        default: return undefined;
    }
}
