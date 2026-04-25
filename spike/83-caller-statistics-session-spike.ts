import assert from 'node:assert/strict';
import { MongoClient, type Collection } from 'mongodb';

type FinalOutcome =
    | 'joined_waitlist'
    | 'dropped_before_choice'
    | 'dropped_during_name'
    | 'dropped_during_size'
    | 'dropped_during_phone_confirmation'
    | 'front_desk_transfer'
    | 'catering_transfer'
    | 'menu_only'
    | 'hours_only'
    | 'join_error';

type CurrentStage =
    | 'incoming'
    | 'menu'
    | 'ask_name'
    | 'ask_size'
    | 'confirm_phone'
    | 'joined'
    | 'resolved';

interface SessionStep {
    at: Date;
    event:
        | 'incoming'
        | 'menu_choice'
        | 'join_intent'
        | 'name_captured'
        | 'size_captured'
        | 'phone_source'
        | 'joined'
        | 'transfer'
        | 'resolved_info'
        | 'auto_finalized';
    detail?: string;
}

interface VoiceCallSession {
    callSid: string;
    locationId: string;
    serviceDay: string;
    startedAt: Date;
    lastEventAt: Date;
    endedAt?: Date;
    callerLast4?: string;
    firstMenuChoice?: 'join_waitlist' | 'repeat_wait' | 'menu' | 'hours' | 'front_desk' | 'catering';
    joinIntent?: boolean;
    nameCaptureMode?: 'normal' | 'fallback';
    partySize?: number;
    phoneSource?: 'caller_id' | 'manual';
    queueCode?: string;
    currentStage: CurrentStage;
    finalOutcome?: FinalOutcome;
    steps: SessionStep[];
}

const DB_NAME = 'skb_spike_83_caller_stats';
const COLLECTION = 'voice_call_sessions_spike';
const SESSION_TIMEOUT_MS = 2 * 60 * 1000;

function serviceDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function last4(from?: string): string | undefined {
    const digits = String(from ?? '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : undefined;
}

async function createSessionIndexes(coll: Collection<VoiceCallSession>): Promise<void> {
    await coll.createIndex({ callSid: 1 }, { unique: true, name: 'callSid_unique' });
    await coll.createIndex({ locationId: 1, serviceDay: 1, startedAt: -1 }, { name: 'loc_day_started' });
    await coll.createIndex(
        { locationId: 1, serviceDay: 1, finalOutcome: 1, firstMenuChoice: 1 },
        { name: 'loc_day_outcome_choice' },
    );
}

async function ensureSession(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    locationId: string,
    at: Date,
    from?: string,
): Promise<void> {
    await coll.updateOne(
        { callSid },
        {
            $setOnInsert: {
                callSid,
                locationId,
                serviceDay: serviceDay(at),
                startedAt: at,
                currentStage: 'incoming' as CurrentStage,
            },
            $set: {
                lastEventAt: at,
                ...(from ? { callerLast4: last4(from) } : {}),
            },
            $push: {
                steps: { at, event: 'incoming' as const },
            },
        },
        { upsert: true },
    );
}

async function appendStep(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    at: Date,
    patch: Partial<VoiceCallSession>,
    step: SessionStep,
): Promise<void> {
    await coll.updateOne(
        { callSid },
        {
            $set: {
                ...patch,
                lastEventAt: at,
            },
            $push: {
                steps: step,
            },
        },
    );
}

async function recordMenuChoice(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    choice: NonNullable<VoiceCallSession['firstMenuChoice']>,
    at: Date,
): Promise<void> {
    await appendStep(
        coll,
        callSid,
        at,
        { firstMenuChoice: choice, currentStage: 'menu' },
        { at, event: 'menu_choice', detail: choice },
    );
}

async function recordJoinIntent(coll: Collection<VoiceCallSession>, callSid: string, at: Date): Promise<void> {
    await appendStep(
        coll,
        callSid,
        at,
        { joinIntent: true, currentStage: 'ask_name' },
        { at, event: 'join_intent' },
    );
}

async function recordNameCaptured(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    mode: NonNullable<VoiceCallSession['nameCaptureMode']>,
    at: Date,
): Promise<void> {
    await appendStep(
        coll,
        callSid,
        at,
        { nameCaptureMode: mode, currentStage: 'ask_size' },
        { at, event: 'name_captured', detail: mode },
    );
}

async function recordSizeCaptured(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    partySize: number,
    at: Date,
): Promise<void> {
    await appendStep(
        coll,
        callSid,
        at,
        { partySize, currentStage: 'confirm_phone' },
        { at, event: 'size_captured', detail: String(partySize) },
    );
}

async function recordPhoneSource(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    phoneSource: NonNullable<VoiceCallSession['phoneSource']>,
    at: Date,
): Promise<void> {
    await appendStep(
        coll,
        callSid,
        at,
        { phoneSource, currentStage: 'confirm_phone' },
        { at, event: 'phone_source', detail: phoneSource },
    );
}

async function recordJoined(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    queueCode: string,
    at: Date,
): Promise<void> {
    await appendStep(
        coll,
        callSid,
        at,
        {
            queueCode,
            currentStage: 'joined',
            finalOutcome: 'joined_waitlist',
            endedAt: at,
        },
        { at, event: 'joined', detail: queueCode },
    );
}

async function recordTransfer(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    outcome: 'front_desk_transfer' | 'catering_transfer',
    at: Date,
): Promise<void> {
    await appendStep(
        coll,
        callSid,
        at,
        { currentStage: 'resolved', finalOutcome: outcome, endedAt: at },
        { at, event: 'transfer', detail: outcome },
    );
}

async function recordResolvedInfo(
    coll: Collection<VoiceCallSession>,
    callSid: string,
    outcome: 'menu_only' | 'hours_only',
    at: Date,
): Promise<void> {
    await appendStep(
        coll,
        callSid,
        at,
        { currentStage: 'resolved', finalOutcome: outcome, endedAt: at },
        { at, event: 'resolved_info', detail: outcome },
    );
}

function deriveDroppedOutcome(session: VoiceCallSession): FinalOutcome {
    switch (session.currentStage) {
        case 'incoming':
        case 'menu':
            return 'dropped_before_choice';
        case 'ask_name':
            return 'dropped_during_name';
        case 'ask_size':
            return 'dropped_during_size';
        case 'confirm_phone':
            return 'dropped_during_phone_confirmation';
        default:
            return 'join_error';
    }
}

async function finalizeExpiredSessions(coll: Collection<VoiceCallSession>, now: Date): Promise<number> {
    const staleBefore = new Date(now.getTime() - SESSION_TIMEOUT_MS);
    const openSessions = await coll.find({
        finalOutcome: { $exists: false },
        lastEventAt: { $lt: staleBefore },
    }).toArray();

    for (const session of openSessions) {
        const finalOutcome = deriveDroppedOutcome(session);
        await appendStep(
            coll,
            session.callSid,
            now,
            { finalOutcome, endedAt: now, currentStage: 'resolved' },
            { at: now, event: 'auto_finalized', detail: finalOutcome },
        );
    }

    return openSessions.length;
}

async function aggregateFunnel(
    coll: Collection<VoiceCallSession>,
    locationId: string,
    day: string,
): Promise<Record<string, number>> {
    const sessions = await coll.find({ locationId, serviceDay: day }).toArray();
    const result: Record<string, number> = {
        inboundCalls: sessions.length,
        joinIntent: 0,
        joinedWaitlist: 0,
        droppedBeforeChoice: 0,
        droppedDuringName: 0,
        droppedDuringSize: 0,
        droppedDuringPhoneConfirmation: 0,
        frontDeskTransfer: 0,
        cateringTransfer: 0,
        menuOnly: 0,
        hoursOnly: 0,
    };

    for (const session of sessions) {
        if (session.joinIntent) result.joinIntent++;
        switch (session.finalOutcome) {
            case 'joined_waitlist':
                result.joinedWaitlist++;
                break;
            case 'dropped_before_choice':
                result.droppedBeforeChoice++;
                break;
            case 'dropped_during_name':
                result.droppedDuringName++;
                break;
            case 'dropped_during_size':
                result.droppedDuringSize++;
                break;
            case 'dropped_during_phone_confirmation':
                result.droppedDuringPhoneConfirmation++;
                break;
            case 'front_desk_transfer':
                result.frontDeskTransfer++;
                break;
            case 'catering_transfer':
                result.cateringTransfer++;
                break;
            case 'menu_only':
                result.menuOnly++;
                break;
            case 'hours_only':
                result.hoursOnly++;
                break;
        }
    }

    return result;
}

async function main(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 });
    await client.connect();

    const db = client.db(DB_NAME);
    const coll = db.collection<VoiceCallSession>(COLLECTION);
    await coll.deleteMany({});
    await createSessionIndexes(coll);

    const t0 = new Date('2026-04-25T18:00:00.000Z');
    const loc = 'skb';
    const day = serviceDay(t0);

    // Successful waitlist join through the full flow.
    await ensureSession(coll, 'CA-join', loc, t0, '+12065550111');
    await recordMenuChoice(coll, 'CA-join', 'join_waitlist', new Date(t0.getTime() + 5_000));
    await recordJoinIntent(coll, 'CA-join', new Date(t0.getTime() + 10_000));
    await recordNameCaptured(coll, 'CA-join', 'normal', new Date(t0.getTime() + 15_000));
    await recordSizeCaptured(coll, 'CA-join', 2, new Date(t0.getTime() + 20_000));
    await recordPhoneSource(coll, 'CA-join', 'caller_id', new Date(t0.getTime() + 25_000));
    await recordJoined(coll, 'CA-join', 'SKB-A11', new Date(t0.getTime() + 30_000));

    // Caller enters join flow, fails speech twice, then drops before entering party size.
    await ensureSession(coll, 'CA-drop-name', loc, new Date(t0.getTime() + 60_000), '+12065550222');
    await recordMenuChoice(coll, 'CA-drop-name', 'join_waitlist', new Date(t0.getTime() + 65_000));
    await recordJoinIntent(coll, 'CA-drop-name', new Date(t0.getTime() + 70_000));

    // Caller reaches size prompt, name captured via fallback, then disappears.
    await ensureSession(coll, 'CA-drop-size', loc, new Date(t0.getTime() + 120_000), '+12065550333');
    await recordMenuChoice(coll, 'CA-drop-size', 'join_waitlist', new Date(t0.getTime() + 125_000));
    await recordJoinIntent(coll, 'CA-drop-size', new Date(t0.getTime() + 130_000));
    await recordNameCaptured(coll, 'CA-drop-size', 'fallback', new Date(t0.getTime() + 135_000));

    // Caller reaches phone confirmation, rejects caller ID, then disappears.
    await ensureSession(coll, 'CA-drop-phone', loc, new Date(t0.getTime() + 180_000), '+12065550444');
    await recordMenuChoice(coll, 'CA-drop-phone', 'join_waitlist', new Date(t0.getTime() + 185_000));
    await recordJoinIntent(coll, 'CA-drop-phone', new Date(t0.getTime() + 190_000));
    await recordNameCaptured(coll, 'CA-drop-phone', 'normal', new Date(t0.getTime() + 195_000));
    await recordSizeCaptured(coll, 'CA-drop-phone', 4, new Date(t0.getTime() + 200_000));
    await recordPhoneSource(coll, 'CA-drop-phone', 'manual', new Date(t0.getTime() + 205_000));

    // Informational call resolved by menu branch.
    await ensureSession(coll, 'CA-menu', loc, new Date(t0.getTime() + 240_000), '+12065550555');
    await recordMenuChoice(coll, 'CA-menu', 'menu', new Date(t0.getTime() + 245_000));
    await recordResolvedInfo(coll, 'CA-menu', 'menu_only', new Date(t0.getTime() + 255_000));

    // Human transfer from main menu.
    await ensureSession(coll, 'CA-transfer', loc, new Date(t0.getTime() + 300_000), '+12065550666');
    await recordMenuChoice(coll, 'CA-transfer', 'front_desk', new Date(t0.getTime() + 305_000));
    await recordTransfer(coll, 'CA-transfer', 'front_desk_transfer', new Date(t0.getTime() + 315_000));

    const finalized = await finalizeExpiredSessions(coll, new Date(t0.getTime() + 10 * 60 * 1000));
    const aggregate = await aggregateFunnel(coll, loc, day);

    assert.equal(finalized, 3, 'expected 3 incomplete sessions to auto-finalize');
    assert.deepEqual(aggregate, {
        inboundCalls: 6,
        joinIntent: 4,
        joinedWaitlist: 1,
        droppedBeforeChoice: 0,
        droppedDuringName: 1,
        droppedDuringSize: 1,
        droppedDuringPhoneConfirmation: 1,
        frontDeskTransfer: 1,
        cateringTransfer: 0,
        menuOnly: 1,
        hoursOnly: 0,
    });

    const finalizedSessions = await coll.find({}, { projection: { _id: 0 } }).sort({ startedAt: 1 }).toArray();

    console.log('Spike hypothesis: one Mongo document per CallSid can represent the full IVR session and be auto-finalized after timeout.');
    console.log(`Validated against database: ${DB_NAME}.${COLLECTION}`);
    console.log(`Auto-finalized sessions: ${finalized}`);
    console.log('Aggregate funnel:', JSON.stringify(aggregate, null, 2));
    console.log('Final outcomes by CallSid:');
    for (const session of finalizedSessions) {
        console.log(`- ${session.callSid}: ${session.finalOutcome} (${session.currentStage})`);
    }

    await client.close();
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
