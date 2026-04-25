// ============================================================================
// SKB - Voice caller-session persistence
// ============================================================================

import { getDb, voiceCallSessions } from '../core/db/mongo.js';
import { serviceDay } from '../core/utils/time.js';
import type {
    VoiceCallCurrentStage,
    VoiceCallFinalOutcome,
    VoiceCallSession,
    VoiceCallSessionMenuChoice,
    VoiceCallSessionStep,
    VoiceCallTransferReason,
} from '../types/queue.js';

export const SESSION_TIMEOUT_MS = 2 * 60 * 1000;

function callerLast4(from?: string): string | undefined {
    const digits = String(from ?? '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : undefined;
}

function serializeStepDetail(value: string | number | undefined): string | undefined {
    return value === undefined ? undefined : String(value);
}

async function appendStep(
    callSid: string,
    at: Date,
    patch: Partial<VoiceCallSession>,
    step: VoiceCallSessionStep,
    unsetFields: string[] = [],
): Promise<void> {
    const db = await getDb();
    const updateDoc: {
        $set: Record<string, unknown>;
        $push: { steps: VoiceCallSessionStep };
        $unset?: Record<string, ''>;
    } = {
        $set: {
            ...patch,
            lastEventAt: at,
        },
        $push: {
            steps: step,
        },
    };
    if (unsetFields.length > 0) {
        updateDoc.$unset = Object.fromEntries(unsetFields.map((field) => [field, '']));
    }
    await voiceCallSessions(db).updateOne(
        { callSid },
        updateDoc,
    );
}

export async function recordIncoming(
    callSid: string,
    locationId: string,
    at: Date,
    from?: string,
): Promise<void> {
    const db = await getDb();
    await voiceCallSessions(db).updateOne(
        { callSid },
        {
            $setOnInsert: {
                locationId,
                callSid,
                serviceDay: serviceDay(at),
                startedAt: at,
                steps: [],
            },
            $set: {
                currentStage: 'incoming' as VoiceCallCurrentStage,
                lastEventAt: at,
                ...(from ? { callerLast4: callerLast4(from) } : {}),
            },
        },
        { upsert: true },
    );
    await appendStep(callSid, at, {}, { at, event: 'incoming' });
}

export async function recordMenuChoice(
    callSid: string,
    at: Date,
    choice: VoiceCallSessionMenuChoice,
): Promise<void> {
    const db = await getDb();
    const coll = voiceCallSessions(db);
    const patch = {
        currentStage: 'menu' as VoiceCallCurrentStage,
    };
    const step = { at, event: 'menu_choice' as const, detail: choice };
    const unsetFields = ['finalOutcome', 'endedAt', 'transferReason'];
    const firstChoiceWrite = await coll.updateOne(
        { callSid, firstMenuChoice: { $exists: false } },
        {
            $set: {
                ...patch,
                firstMenuChoice: choice,
                lastEventAt: at,
            },
            $unset: Object.fromEntries(unsetFields.map((field) => [field, ''])),
            $push: { steps: step },
        },
    );
    if (firstChoiceWrite.matchedCount > 0) return;
    await appendStep(callSid, at, patch, step, unsetFields);
}

export async function recordJoinIntent(callSid: string, at: Date): Promise<void> {
    await appendStep(
        callSid,
        at,
        { joinIntent: true, currentStage: 'ask_name' },
        { at, event: 'join_intent' },
        ['finalOutcome', 'endedAt', 'transferReason'],
    );
}

export async function recordNameCaptured(
    callSid: string,
    at: Date,
    mode: 'normal' | 'fallback',
): Promise<void> {
    await appendStep(
        callSid,
        at,
        { nameCaptureMode: mode, currentStage: 'ask_size' },
        { at, event: 'name_captured', detail: mode },
        ['finalOutcome', 'endedAt', 'transferReason'],
    );
}

export async function recordSizeCaptured(
    callSid: string,
    at: Date,
    partySize: number,
): Promise<void> {
    await appendStep(
        callSid,
        at,
        { partySize, currentStage: 'confirm_phone' },
        { at, event: 'size_captured', detail: serializeStepDetail(partySize) },
        ['finalOutcome', 'endedAt', 'transferReason'],
    );
}

export async function recordPhoneSource(
    callSid: string,
    at: Date,
    source: 'caller_id' | 'manual',
): Promise<void> {
    await appendStep(
        callSid,
        at,
        { phoneSource: source, currentStage: 'confirm_phone' },
        { at, event: 'phone_source', detail: source },
        ['finalOutcome', 'endedAt', 'transferReason'],
    );
}

export async function recordJoined(
    callSid: string,
    at: Date,
    queueCode: string,
): Promise<void> {
    await appendStep(
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

export async function recordTransfer(
    callSid: string,
    at: Date,
    outcome: 'front_desk_transfer' | 'catering_transfer',
    reason?: VoiceCallTransferReason,
): Promise<void> {
    await appendStep(
        callSid,
        at,
        {
            currentStage: 'resolved',
            finalOutcome: outcome,
            endedAt: at,
            ...(reason ? { transferReason: reason } : {}),
        },
        { at, event: 'transfer', detail: reason ?? outcome },
    );
}

export async function recordResolvedInfo(
    callSid: string,
    at: Date,
    outcome: 'menu_only' | 'hours_only',
): Promise<void> {
    await appendStep(
        callSid,
        at,
        {
            currentStage: 'resolved',
            finalOutcome: outcome,
            endedAt: at,
        },
        { at, event: 'resolved_info', detail: outcome },
    );
}

export async function recordJoinError(callSid: string, at: Date, detail: string): Promise<void> {
    await appendStep(
        callSid,
        at,
        {
            currentStage: 'resolved',
            finalOutcome: 'join_error',
            endedAt: at,
        },
        { at, event: 'join_error', detail },
    );
}

export function deriveDroppedOutcome(stage: VoiceCallCurrentStage): VoiceCallFinalOutcome {
    switch (stage) {
        case 'incoming':
        case 'menu':
            return 'dropped_before_choice';
        case 'ask_name':
            return 'dropped_during_name';
        case 'ask_size':
            return 'dropped_during_size';
        case 'confirm_phone':
            return 'dropped_during_phone_confirmation';
        case 'joined':
            return 'joined_waitlist';
        case 'resolved':
            return 'join_error';
    }
}

export async function finalizeExpiredSessions(locationId: string, now: Date = new Date()): Promise<number> {
    const db = await getDb();
    const coll = voiceCallSessions(db);
    const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MS);
    const stale = await coll.find({
        locationId,
        finalOutcome: { $exists: false },
        lastEventAt: { $lt: cutoff },
    }).toArray();

    for (const session of stale) {
        const finalOutcome = deriveDroppedOutcome(session.currentStage);
        await coll.updateOne(
            { _id: session._id, finalOutcome: { $exists: false } },
            {
                $set: {
                    finalOutcome,
                    currentStage: 'resolved',
                    endedAt: now,
                    lastEventAt: now,
                },
                $push: {
                    steps: { at: now, event: 'auto_finalized', detail: finalOutcome },
                },
            },
        );
    }

    return stale.length;
}
