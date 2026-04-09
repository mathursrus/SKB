// ============================================================================
// SKB - Queue types (domain + API DTOs)
// ============================================================================

// Multi-tenant: each restaurant is a "location" identified by a slug.
export interface Location {
    _id: string;         // slug, e.g., "skb", "skb-demo"
    name: string;        // display name, e.g., "Shri Krishna Bhavan"
    pin: string;         // host-stand PIN for this location
    createdAt: Date;
    publicUrl?: string;       // public HTTPS base URL, e.g., "https://skb.azurewebsites.net"
    googlePlaceId?: string;   // Google Maps Place ID, e.g., "ChIJ..."
}

export type PartyState = 'waiting' | 'called' | 'seated' | 'ordered' | 'served' | 'checkout' | 'departed' | 'no_show';
export type RemovalReason = 'seated' | 'no_show' | 'departed';

export interface QueueEntry {
    locationId: string; // tenant slug, e.g., "skb"
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
    seatedAt?: Date;
    orderedAt?: Date;
    servedAt?: Date;
    checkoutAt?: Date;
    departedAt?: Date;
    serviceDay: string; // YYYY-MM-DD in PT
}

export interface Settings {
    _id: string; // locationId, e.g., "skb"
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

export interface BoardEntryDTO {
    position: number;
    code: string;
    state: string;
}

export interface HostStatsDTO {
    partiesSeated: number;
    noShows: number;
    avgActualWaitMinutes: number | null;
    peakHour: number | null;          // 0-23, PT
    peakHourLabel: string | null;     // e.g., "12 PM"
    configuredTurnTime: number;       // current avgTurnTimeMinutes setting
    actualTurnTime: number | null;    // computed from today's seated data
    totalJoined: number;              // total entries for today (all states)
    stillWaiting: number;             // entries still in waiting/called state
    // Lifecycle metrics (null if no departed parties with required timestamps)
    avgOrderTimeMinutes: number | null;    // avg seated → ordered
    avgServeTimeMinutes: number | null;    // avg ordered → served
    avgCheckoutTimeMinutes: number | null; // avg checkout → departed
    avgTableOccupancyMinutes: number | null; // avg seated → departed
}

export interface HostDiningPartyDTO {
    id: string;
    name: string;
    partySize: number;
    phoneLast4: string | null;
    state: 'seated' | 'ordered' | 'served' | 'checkout';
    seatedAt: string;        // ISO
    timeInStateMinutes: number;
    totalTableMinutes: number;
}

export interface HostDiningDTO {
    parties: HostDiningPartyDTO[];
    diningCount: number;
}

export interface HostCompletedPartyDTO {
    id: string;
    name: string;
    partySize: number;
    state: PartyState;
    joinedAt: string;        // ISO
    waitTimeMinutes: number; // join to seated (or join to removal for no-show)
    tableTimeMinutes: number | null; // seated to departed (null for no-show)
    totalTimeMinutes: number; // join to departure/removal
}

export interface HostCompletedDTO {
    parties: HostCompletedPartyDTO[];
    totalServed: number;
    totalNoShows: number;
    avgWaitMinutes: number | null;
    avgTableOccupancyMinutes: number | null;
}

export interface PartyTimelineDTO {
    id: string;
    name: string;
    partySize: number;
    state: PartyState;
    timestamps: {
        joinedAt: string | null;
        calledAt: string | null;  // first call timestamp
        seatedAt: string | null;
        orderedAt: string | null;
        servedAt: string | null;
        checkoutAt: string | null;
        departedAt: string | null;
    };
}

export interface AdvanceRequestDTO {
    state: 'ordered' | 'served' | 'checkout' | 'departed';
}

// Analytics DTOs ---------------------------------------------------------------

export interface HistogramBucket {
    minMinutes: number;
    maxMinutes: number;
    label: string;        // e.g., "10-15m"
    count: number;
    probability: number;  // 0..1
}

export interface PhaseHistogram {
    phase: string;        // e.g., "wait", "order", "kitchen", "eating", "checkout", "table"
    label: string;        // human-readable, e.g., "Wait Time (join → seated)"
    buckets: HistogramBucket[];
    avg: number | null;
    total: number;        // sample count
}

export interface AnalyticsDTO {
    histograms: PhaseHistogram[];
    dateRange: { from: string; to: string };
    partySizeFilter: string; // "all" | "1-2" | "3-4" | "5+"
    totalParties: number;
}

export interface ErrorDTO {
    error: string;
    field?: string;
}
