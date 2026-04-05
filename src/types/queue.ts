// ============================================================================
// SKB - Queue types (domain + API DTOs)
// ============================================================================

export type PartyState = 'waiting' | 'called' | 'seated' | 'no_show';
export type RemovalReason = 'seated' | 'no_show';

export interface QueueEntry {
    code: string; // e.g., "SKB-7Q3"
    name: string;
    partySize: number; // 1..10
    phoneLast4?: string; // "1234"
    state: PartyState;
    joinedAt: Date;
    promisedEtaAt: Date; // fixed at join time; never changes — the original commitment
    calls?: Date[]; // timestamps of every Call/Recall click (oldest → newest)
    removedAt?: Date;
    removedReason?: RemovalReason;
    serviceDay: string; // YYYY-MM-DD in PT
}

export interface Settings {
    _id: 'global';
    avgTurnTimeMinutes: number;
    updatedAt: Date;
}

// API DTOs --------------------------------------------------------------------

export interface QueueStateDTO {
    partiesWaiting: number;
    etaForNewPartyMinutes: number;
    avgTurnTimeMinutes: number;
}

export interface JoinRequestDTO {
    name: string;
    partySize: number;
    phoneLast4?: string;
}

export interface JoinResponseDTO {
    code: string;
    position: number;
    etaAt: string; // ISO8601
    etaMinutes: number;
}

export interface StatusResponseDTO {
    code: string;
    position: number;
    etaAt: string | null;
    etaMinutes: number | null; // minutes until seated, from now
    state: PartyState | 'not_found';
    callsMinutesAgo: number[]; // one entry per host Call/Recall (oldest → newest)
}

export interface HostPartyDTO {
    id: string;
    position: number;
    name: string;
    partySize: number;
    phoneLast4: string | null;
    joinedAt: string; // ISO
    etaAt: string; // ISO
    waitingMinutes: number;
    state: 'waiting' | 'called';
    callsMinutesAgo: number[]; // one entry per Call click, oldest → newest
}

export interface HostQueueDTO {
    parties: HostPartyDTO[];
    oldestWaitMinutes: number;
    avgTurnTimeMinutes: number;
}

export interface ErrorDTO {
    error: string;
    field?: string;
}
