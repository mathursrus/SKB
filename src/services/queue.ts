// ============================================================================
// SKB - Queue service (join, list, remove, status) — multi-tenant
// ============================================================================

import { ObjectId } from 'mongodb';

import { getDb, queueEntries } from '../core/db/mongo.js';
import { generateCode } from './codes.js';
import { getAvgTurnTime } from './settings.js';
import { addMinutes, minutesBetween, serviceDay } from '../core/utils/time.js';
import type {
    BoardEntryDTO,
    HostPartyDTO,
    HostQueueDTO,
    JoinRequestDTO,
    JoinResponseDTO,
    PartyState,
    QueueEntry,
    QueueStateDTO,
    RemovalReason,
    StatusResponseDTO,
} from '../types/queue.js';

const MAX_CODE_RETRIES = 5;

const ACTIVE_STATES: QueueEntry['state'][] = ['waiting', 'called'];

// -- Pure helpers -------------------------------------------------------------

export function computeEtaMinutes(
    position: number,
    avgTurnTimeMinutes: number,
): number {
    if (position < 1) return 0;
    return position * avgTurnTimeMinutes;
}

export function positionInList(
    waiting: Pick<QueueEntry, 'code'>[],
    code: string,
): number {
    for (let i = 0; i < waiting.length; i++) {
        if (waiting[i].code === code) return i + 1;
    }
    return 0;
}

// -- Persistence (all queries scoped to locationId) ---------------------------

export async function getQueueState(locationId: string, now: Date = new Date()): Promise<QueueStateDTO> {
    const db = await getDb();
    const today = serviceDay(now);
    const partiesWaiting = await queueEntries(db).countDocuments({
        locationId,
        serviceDay: today,
        state: { $in: ACTIVE_STATES },
    });
    const avg = await getAvgTurnTime(locationId);
    return {
        partiesWaiting,
        etaForNewPartyMinutes: (partiesWaiting + 1) * avg,
        avgTurnTimeMinutes: avg,
    };
}

export async function joinQueue(
    locationId: string,
    req: JoinRequestDTO,
    now: Date = new Date(),
): Promise<JoinResponseDTO> {
    const db = await getDb();
    const today = serviceDay(now);
    const avg = await getAvgTurnTime(locationId);

    const aheadAtJoin = await queueEntries(db).countDocuments({
        locationId,
        serviceDay: today,
        state: { $in: ACTIVE_STATES },
    });
    const positionAtJoin = aheadAtJoin + 1;
    const promisedMinutes = computeEtaMinutes(positionAtJoin, avg);
    const promisedEtaAt = addMinutes(now, promisedMinutes);

    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
        const code = generateCode();
        const entry: QueueEntry = {
            locationId,
            code,
            name: req.name,
            partySize: req.partySize,
            phoneLast4: req.phoneLast4,
            state: 'waiting',
            joinedAt: now,
            promisedEtaAt,
            serviceDay: today,
        };
        try {
            await queueEntries(db).insertOne(entry);
            return {
                code,
                position: positionAtJoin,
                etaAt: promisedEtaAt.toISOString(),
                etaMinutes: promisedMinutes,
            };
        } catch (err: unknown) {
            if (
                err &&
                typeof err === 'object' &&
                'code' in err &&
                (err as { code: number }).code === 11000
            ) {
                lastErr = err;
                continue;
            }
            throw err;
        }
    }
    throw new Error(`Failed to allocate unique code after ${MAX_CODE_RETRIES} tries: ${String(lastErr)}`);
}

export async function getStatusByCode(
    code: string,
    now: Date = new Date(),
): Promise<StatusResponseDTO> {
    const db = await getDb();
    const entry = await queueEntries(db).findOne({ code });
    if (!entry) {
        return { code, position: 0, etaAt: null, etaMinutes: null, state: 'not_found', callsMinutesAgo: [] };
    }
    const postQueueStates: PartyState[] = ['seated', 'ordered', 'served', 'checkout', 'departed', 'no_show'];
    if (postQueueStates.includes(entry.state)) {
        return { code, position: 0, etaAt: null, etaMinutes: null, state: entry.state, callsMinutesAgo: [] };
    }
    const today = serviceDay(now);
    if (entry.serviceDay !== today) {
        return { code, position: 0, etaAt: null, etaMinutes: null, state: 'not_found', callsMinutesAgo: [] };
    }
    const ahead = await queueEntries(db).countDocuments({
        locationId: entry.locationId,
        serviceDay: today,
        state: { $in: ACTIVE_STATES },
        joinedAt: { $lt: entry.joinedAt },
    });
    const position = ahead + 1;
    const avg = await getAvgTurnTime(entry.locationId);
    const etaMinutes = computeEtaMinutes(position, avg);
    return {
        code,
        position,
        etaAt: (entry.promisedEtaAt ?? entry.joinedAt).toISOString(),
        etaMinutes,
        state: entry.state,
        callsMinutesAgo: (entry.calls ?? []).map((c) => minutesBetween(c, now)),
    };
}

export async function listHostQueue(locationId: string, now: Date = new Date()): Promise<HostQueueDTO> {
    const db = await getDb();
    const today = serviceDay(now);
    const avg = await getAvgTurnTime(locationId);
    const docs = await queueEntries(db)
        .find({ locationId, serviceDay: today, state: { $in: ACTIVE_STATES } })
        .sort({ joinedAt: 1 })
        .toArray();

    const parties: HostPartyDTO[] = docs.map((d, i) => {
        const position = i + 1;
        return {
            id: String(d._id ?? ''),
            position,
            name: d.name,
            partySize: d.partySize,
            phoneLast4: d.phoneLast4 ?? null,
            joinedAt: d.joinedAt.toISOString(),
            etaAt: (d.promisedEtaAt ?? d.joinedAt).toISOString(),
            waitingMinutes: minutesBetween(d.joinedAt, now),
            state: d.state as 'waiting' | 'called',
            callsMinutesAgo: (d.calls ?? []).map((c) => minutesBetween(c, now)),
        };
    });

    const oldest = docs.length > 0 ? minutesBetween(docs[0].joinedAt, now) : 0;
    return { parties, oldestWaitMinutes: oldest, avgTurnTimeMinutes: avg };
}

export async function removeFromQueue(
    id: string,
    reason: RemovalReason,
    now: Date = new Date(),
): Promise<{ ok: boolean }> {
    if (reason !== 'seated' && reason !== 'no_show') {
        throw new Error(`invalid reason: ${reason}`);
    }
    const db = await getDb();
    let _id: ObjectId;
    try {
        _id = new ObjectId(id);
    } catch {
        throw new Error('invalid id');
    }

    if (reason === 'seated') {
        const res = await queueEntries(db).updateOne(
            { _id, state: { $in: ACTIVE_STATES } },
            { $set: { state: 'seated' as PartyState, seatedAt: now } },
        );
        return { ok: res.matchedCount === 1 };
    }

    const res = await queueEntries(db).updateOne(
        { _id, state: { $in: ACTIVE_STATES } },
        { $set: { state: reason as PartyState, removedAt: now, removedReason: reason } },
    );
    return { ok: res.matchedCount === 1 };
}

export async function callParty(
    id: string,
    now: Date = new Date(),
): Promise<{ ok: boolean }> {
    const db = await getDb();
    let _id: ObjectId;
    try {
        _id = new ObjectId(id);
    } catch {
        throw new Error('invalid id');
    }
    const res = await queueEntries(db).updateOne(
        { _id, state: { $in: ACTIVE_STATES } },
        { $set: { state: 'called' }, $push: { calls: now } },
    );
    return { ok: res.matchedCount === 1 };
}

export async function getBoardEntries(locationId: string, now: Date = new Date()): Promise<BoardEntryDTO[]> {
    const db = await getDb();
    const today = serviceDay(now);
    const docs = await queueEntries(db)
        .find({ locationId, serviceDay: today, state: { $in: ACTIVE_STATES } })
        .sort({ joinedAt: 1 })
        .toArray();

    return docs.map((d, i): BoardEntryDTO => ({
        position: i + 1,
        code: d.code,
        state: d.state,
    }));
}
