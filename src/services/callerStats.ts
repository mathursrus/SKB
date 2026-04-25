// ============================================================================
// SKB - Caller statistics aggregation
// ============================================================================

import { getDb, voiceCallSessions } from '../core/db/mongo.js';
import type {
    CallerStatsDTO,
    CallerStatsMenuChoiceDTO,
    CallerStatsRecentSessionStepDTO,
    CallerStatsOutcomeDTO,
    CallerStatsRecentSessionDTO,
    VoiceCallFinalOutcome,
    VoiceCallSession,
    VoiceCallSessionMenuChoice,
} from '../types/queue.js';
import { finalizeExpiredSessions } from './voiceCallSessions.js';
import { serviceDay } from '../core/utils/time.js';

const OUTCOME_ORDER: VoiceCallFinalOutcome[] = [
    'dropped_before_choice',
    'dropped_during_name',
    'dropped_during_size',
    'dropped_during_phone_confirmation',
    'front_desk_transfer',
    'catering_transfer',
    'menu_only',
    'hours_only',
    'join_error',
    'joined_waitlist',
];

const MENU_CHOICE_ORDER: VoiceCallSessionMenuChoice[] = [
    'join_waitlist',
    'repeat_wait',
    'menu',
    'hours',
    'front_desk',
    'catering',
];

function dateRangeToDays(range: string): number {
    switch (range) {
        case '1': return 1;
        case '7': return 7;
        case '30': return 30;
        default: return 1;
    }
}

function roundShare(count: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((count / total) * 1000) / 1000;
}

function buildServiceDays(now: Date, days: number): string[] {
    const values: string[] = [];
    for (let i = 0; i < days; i += 1) {
        values.push(serviceDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
    }
    return values;
}

function reachedPhoneConfirmation(session: VoiceCallSession): boolean {
    return Boolean(
        session.phoneSource
        || session.finalOutcome === 'dropped_during_phone_confirmation'
        || session.finalOutcome === 'joined_waitlist'
        || session.currentStage === 'confirm_phone',
    );
}

function recentRow(session: VoiceCallSession): CallerStatsRecentSessionDTO | null {
    if (!session.finalOutcome) return null;
    return {
        startedAt: session.startedAt.toISOString(),
        finalOutcome: session.finalOutcome,
        firstMenuChoice: session.firstMenuChoice,
        queueCode: session.queueCode,
        callerLast4: session.callerLast4,
        nameCaptureMode: session.nameCaptureMode,
        phoneSource: session.phoneSource,
        transferReason: session.transferReason,
        journey: session.steps.map((step): CallerStatsRecentSessionStepDTO => ({
            at: step.at.toISOString(),
            event: step.event,
            ...(step.detail ? { detail: step.detail } : {}),
        })),
    };
}

export async function getCallerStats(
    locationId: string,
    range: string = '1',
    now: Date = new Date(),
): Promise<CallerStatsDTO> {
    const db = await getDb();
    const coll = voiceCallSessions(db);
    const days = dateRangeToDays(range);
    const serviceDays = buildServiceDays(now, days);
    const from = serviceDays[serviceDays.length - 1];
    const to = serviceDays[0];

    await finalizeExpiredSessions(locationId, now);

    const sessions = await coll.find({
        locationId,
        serviceDay: { $in: serviceDays },
    }).sort({ startedAt: -1 }).toArray();

    const inboundCalls = sessions.length;
    const joinIntentCount = sessions.filter((session) => session.joinIntent).length;
    const reachedPhoneConfirmationCount = sessions.filter(reachedPhoneConfirmation).length;
    const joinedWaitlistCount = sessions.filter((session) => session.finalOutcome === 'joined_waitlist').length;

    const outcomes: CallerStatsOutcomeDTO[] = OUTCOME_ORDER.map((key) => {
        const count = sessions.filter((session) => session.finalOutcome === key).length;
        return { key, count, share: roundShare(count, inboundCalls) };
    });

    const firstMenuChoices: CallerStatsMenuChoiceDTO[] = MENU_CHOICE_ORDER.map((key) => {
        const count = sessions.filter((session) => session.firstMenuChoice === key).length;
        return { key, count, share: roundShare(count, inboundCalls) };
    });

    const recentSessions = sessions
        .map(recentRow)
        .filter((row): row is CallerStatsRecentSessionDTO => row !== null)
        .slice(0, 12);

    const oldestPersisted = await coll.find({ locationId })
        .sort({ startedAt: 1 })
        .limit(1)
        .next();
    const startsAt = oldestPersisted?.startedAt?.toISOString() ?? null;
    const startsAtServiceDay = oldestPersisted?.serviceDay ?? null;

    return {
        dateRange: { from, to },
        funnel: {
            inboundCalls,
            joinIntent: joinIntentCount,
            reachedPhoneConfirmation: reachedPhoneConfirmationCount,
            joinedWaitlist: joinedWaitlistCount,
        },
        outcomes,
        firstMenuChoices,
        recentSessions,
        historicalCoverage: {
            startsAt,
            hasLegacyGap: startsAtServiceDay !== null && from < startsAtServiceDay,
        },
    };
}
