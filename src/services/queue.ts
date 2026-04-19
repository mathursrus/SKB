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
    CallRecord,
    HostPartyDTO,
    HostQueueDTO,
    JoinRequestDTO,
    JoinResponseDTO,
    PartyState,
    PublicQueueRowDTO,
    QueueEntry,
    QueueStateDTO,
    RemovalReason,
    StatusResponseDTO,
} from '../types/queue.js';
import { sendSms } from './sms.js';
import { firstCallMessage, repeatCallMessage } from './smsTemplates.js';
import { maskPhone } from './sms.js';
import { redactName } from './nameRedact.js';
import { countUnreadForEntries } from './chat.js';

const MAX_CODE_RETRIES = 5;

const ACTIVE_STATES: QueueEntry['state'][] = ['waiting', 'called'];
const DINING_STATES: QueueEntry['state'][] = ['seated', 'ordered', 'served', 'checkout'];

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
        const code = generateCode(locationId);
        const entry: QueueEntry = {
            locationId,
            code,
            name: req.name,
            partySize: req.partySize,
            phone: req.phone,
            smsConsent: req.smsConsent === true,
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
    const empty = { queue: [] as PublicQueueRowDTO[], totalParties: 0 };
    if (!entry) {
        return { code, position: 0, etaAt: null, etaMinutes: null, state: 'not_found', callsMinutesAgo: [], ...empty };
    }
    if (entry.state === 'seated') {
        // Terminal: surface the assigned table but keep the queue empty (R7)
        return {
            code,
            position: 0,
            etaAt: null,
            etaMinutes: null,
            state: 'seated',
            callsMinutesAgo: [],
            ...empty,
            tableNumber: entry.tableNumber,
        };
    }
    const postQueueStates: PartyState[] = ['ordered', 'served', 'checkout', 'departed', 'no_show'];
    if (postQueueStates.includes(entry.state)) {
        return { code, position: 0, etaAt: null, etaMinutes: null, state: entry.state, callsMinutesAgo: [], ...empty };
    }
    const today = serviceDay(now);
    if (entry.serviceDay !== today) {
        return { code, position: 0, etaAt: null, etaMinutes: null, state: 'not_found', callsMinutesAgo: [], ...empty };
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
    const publicQueue = await listPublicQueue(entry.locationId, today, code, now);
    return {
        code,
        position,
        etaAt: (entry.promisedEtaAt ?? entry.joinedAt).toISOString(),
        etaMinutes,
        state: entry.state,
        callsMinutesAgo: (entry.calls ?? []).map((c) => minutesBetween(c.at, now)),
        queue: publicQueue,
        totalParties: publicQueue.length,
        onMyWayAt: entry.onMyWayAt ? entry.onMyWayAt.toISOString() : undefined,
    };
}

/**
 * Build the public waitlist for a given service day, with names redacted to
 * first name + last initial per R3. Sorted by `joinedAt` ascending so each row
 * carries its actual queue position. The viewer's own row is flagged `isMe`
 * but is NOT moved out of sort position (R4).
 */
export async function listPublicQueue(
    locationId: string,
    serviceDayStr: string,
    viewerCode: string,
    now: Date = new Date(),
): Promise<PublicQueueRowDTO[]> {
    const db = await getDb();
    const docs = await queueEntries(db)
        .find({ locationId, serviceDay: serviceDayStr, state: { $in: ACTIVE_STATES } })
        .sort({ joinedAt: 1 })
        .toArray();
    return docs.map((d, i): PublicQueueRowDTO => ({
        position: i + 1,
        displayName: redactName(d.name),
        partySize: d.partySize,
        promisedEtaAt: (d.promisedEtaAt ?? d.joinedAt).toISOString(),
        waitingSeconds: Math.max(0, Math.floor((now.getTime() - d.joinedAt.getTime()) / 1000)),
        isMe: d.code === viewerCode,
    }));
}

/**
 * Sets onMyWayAt on the entry for `code`. Idempotent; does not transition
 * state. Returns ok=false if no matching entry or entry is terminal.
 */
export async function acknowledgeOnMyWay(
    code: string,
    now: Date = new Date(),
): Promise<{ ok: boolean }> {
    const db = await getDb();
    const res = await queueEntries(db).updateOne(
        { code, state: { $in: ACTIVE_STATES } },
        { $set: { onMyWayAt: now } },
    );
    return { ok: res.matchedCount === 1 };
}

export async function listHostQueue(locationId: string, now: Date = new Date()): Promise<HostQueueDTO> {
    const db = await getDb();
    const today = serviceDay(now);
    const avg = await getAvgTurnTime(locationId);
    const docs = await queueEntries(db)
        .find({ locationId, serviceDay: today, state: { $in: ACTIVE_STATES } })
        .sort({ joinedAt: 1 })
        .toArray();

    // Batch-fetch unread counts so the host list doesn't trigger N round-trips
    const codes = docs.map((d) => d.code);
    const unreadMap = codes.length > 0
        ? await countUnreadForEntries(locationId, codes)
        : new Map<string, number>();

    const parties: HostPartyDTO[] = docs.map((d, i) => {
        const position = i + 1;
        return {
            id: String(d._id ?? ''),
            code: d.code,
            position,
            name: d.name,
            partySize: d.partySize,
            phoneMasked: maskPhone(d.phone ?? ''),
            // phoneForDial is host-only — populated here behind the /host/ PIN gate.
            phoneForDial: d.phone ? `+1${d.phone}` : undefined,
            joinedAt: d.joinedAt.toISOString(),
            etaAt: (d.promisedEtaAt ?? d.joinedAt).toISOString(),
            waitingMinutes: minutesBetween(d.joinedAt, now),
            state: d.state as 'waiting' | 'called',
            calls: (d.calls ?? []).map((c) => ({
                minutesAgo: minutesBetween(c.at, now),
                smsStatus: c.smsStatus ?? 'not_configured',
            })),
            unreadChat: unreadMap.get(d.code) ?? 0,
            onMyWayAt: d.onMyWayAt ? d.onMyWayAt.toISOString() : undefined,
        };
    });

    const oldest = docs.length > 0 ? minutesBetween(docs[0].joinedAt, now) : 0;
    return { parties, oldestWaitMinutes: oldest, avgTurnTimeMinutes: avg };
}

export interface RemoveOptions {
    tableNumber?: number; // required when reason === 'seated'
    override?: boolean;   // bypass conflict detection
}

export interface RemoveResult {
    ok: boolean;
    /** Populated when reason==='seated' AND a live party already holds this table AND override !== true. */
    conflict?: { partyName: string; partyId: string };
}

export async function removeFromQueue(
    id: string,
    reason: RemovalReason,
    optsOrNow: RemoveOptions | Date = {},
    nowArg: Date = new Date(),
): Promise<RemoveResult> {
    // Back-compat: legacy callers pass (id, reason, now). New callers pass
    // (id, reason, opts, now).
    const opts: RemoveOptions = optsOrNow instanceof Date ? {} : optsOrNow;
    const now: Date = optsOrNow instanceof Date ? optsOrNow : nowArg;
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
        // The route layer is responsible for validating that new callers pass a
        // tableNumber (R14). The service tolerates missing tableNumber so legacy
        // callers and migration-safe tests keep working.
        const hasTable = typeof opts.tableNumber === 'number'
            && Number.isInteger(opts.tableNumber)
            && opts.tableNumber >= 1 && opts.tableNumber <= 999;

        if (hasTable && !opts.override) {
            const entry = await queueEntries(db).findOne({ _id, state: { $in: ACTIVE_STATES } });
            if (!entry) return { ok: false };
            const conflict = await queueEntries(db).findOne({
                locationId: entry.locationId,
                serviceDay: entry.serviceDay,
                state: { $in: DINING_STATES },
                tableNumber: opts.tableNumber,
                _id: { $ne: _id },
            });
            if (conflict) {
                return { ok: false, conflict: { partyName: conflict.name, partyId: String(conflict._id ?? '') } };
            }
        }

        const update: Record<string, unknown> = { state: 'seated' as PartyState, seatedAt: now };
        if (hasTable) update.tableNumber = opts.tableNumber;
        const res = await queueEntries(db).updateOne(
            { _id, state: { $in: ACTIVE_STATES } },
            { $set: update },
        );
        return { ok: res.matchedCount === 1 };
    }

    // reason === 'no_show'
    const res = await queueEntries(db).updateOne(
        { _id, state: { $in: ACTIVE_STATES } },
        { $set: { state: reason as PartyState, removedAt: now, removedReason: reason } },
    );
    return { ok: res.matchedCount === 1 };
}

/**
 * Best-effort log entry: host tapped the tel: dial link. Non-authoritative;
 * fire-and-forget from the client. We append a CallRecord with a
 * phone_dial-flavored smsStatus so existing analytics don't break.
 */
export async function logCallDial(id: string, now: Date = new Date()): Promise<{ ok: boolean }> {
    const db = await getDb();
    let _id: ObjectId;
    try { _id = new ObjectId(id); } catch { throw new Error('invalid id'); }
    const callRecord: CallRecord = {
        at: now,
        smsStatus: 'not_configured', // phone dial does not go through SMS
    };
    const res = await queueEntries(db).updateOne(
        { _id },
        { $push: { calls: callRecord } },
    );
    return { ok: res.matchedCount === 1 };
}

export async function callParty(
    id: string,
    now: Date = new Date(),
): Promise<{ ok: boolean; smsStatus: 'sent' | 'failed' | 'not_configured' }> {
    const db = await getDb();
    let _id: ObjectId;
    try {
        _id = new ObjectId(id);
    } catch {
        throw new Error('invalid id');
    }

    // 1. Read entry to get phone + code + call count
    const entry = await queueEntries(db).findOne({ _id, state: { $in: ACTIVE_STATES } });
    if (!entry) return { ok: false, smsStatus: 'not_configured' };

    // 2. Send SMS — but only if the diner opted in to messaging (TFV 30513).
    // For non-consenting diners the host must signal in person or call.
    const callCount = (entry.calls?.length ?? 0) + 1;
    const message = callCount === 1
        ? firstCallMessage(entry.code)
        : repeatCallMessage(entry.code, callCount);
    const smsResult = entry.smsConsent === true
        ? await sendSms(entry.phone, message)
        : { successful: false, status: 'not_configured' as const, messageId: '' };

    // 3. Update state + push CallRecord (SMS failure does NOT block this)
    const callRecord: CallRecord = {
        at: now,
        smsStatus: smsResult.successful ? 'sent' : (smsResult.status === 'not_configured' ? 'not_configured' : 'failed'),
        smsMessageId: smsResult.messageId || undefined,
    };
    const res = await queueEntries(db).updateOne(
        { _id, state: { $in: ACTIVE_STATES } },
        { $set: { state: 'called' }, $push: { calls: callRecord } },
    );
    return { ok: res.matchedCount === 1, smsStatus: callRecord.smsStatus };
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
