// ============================================================================
// SKB - Queue types (domain + API DTOs)
// ============================================================================

// Multi-tenant: each restaurant is a "location" identified by a slug.
export interface Location {
    _id: string;         // slug, e.g., "skb", "skb-demo"
    name: string;        // display name, e.g., "Shri Krishna Bhavan"
    pin: string;         // host-stand PIN for this location
    frontDeskPhone?: string; // 10-digit phone for IVR transfer (large parties)
    createdAt: Date;
    publicUrl?: string;       // public HTTPS base URL, e.g., "https://skb.azurewebsites.net"
    googlePlaceId?: string;   // Google Maps Place ID, e.g., "ChIJ..."
    // Visit-page routing: a single stable URL `/r/:loc/visit` that decides at
    // request time what to serve, so the printed door QR never has to change.
    // - 'auto'   (default): show the queue if anyone is waiting, otherwise
    //                       show the menu (or queue if no menuUrl).
    // - 'queue'           : always show the queue page.
    // - 'menu'            : always redirect to menuUrl (or render a stub if unset).
    // - 'closed'          : render a "we're closed" page using closedMessage.
    visitMode?: 'auto' | 'queue' | 'menu' | 'closed';
    menuUrl?: string;         // external URL to redirect to in 'menu' mode
    closedMessage?: string;   // shown to scanners in 'closed' mode
}

export type VisitMode = 'auto' | 'queue' | 'menu' | 'closed';

export type PartyState = 'waiting' | 'called' | 'seated' | 'ordered' | 'served' | 'checkout' | 'departed' | 'no_show';
export type RemovalReason = 'seated' | 'no_show' | 'departed';

export interface CallRecord {
    at: Date;
    smsStatus: 'sent' | 'failed' | 'not_configured';
    smsMessageId?: string;
}

export interface QueueEntry {
    locationId: string; // tenant slug, e.g., "skb"
    code: string; // e.g., "SKB-7Q3"
    name: string;
    partySize: number; // 1..10
    phone: string; // full 10-digit US phone, e.g., "2065551234"
    state: PartyState;
    joinedAt: Date;
    promisedEtaAt: Date; // fixed at join time; never changes — the original commitment
    calls?: CallRecord[]; // structured call records with SMS status (oldest → newest)
    removedAt?: Date;
    removedReason?: RemovalReason;
    seatedAt?: Date;
    tableNumber?: number; // set when transitioning to seated; 1..999
    onMyWayAt?: Date; // set when diner clicks "I'm on my way" (R6)
    orderedAt?: Date;
    servedAt?: Date;
    checkoutAt?: Date;
    departedAt?: Date;
    serviceDay: string; // YYYY-MM-DD in PT
}

export type EtaMode = 'manual' | 'dynamic';

export interface Settings {
    _id: string; // locationId, e.g., "skb"
    avgTurnTimeMinutes: number;
    etaMode?: EtaMode; // absent → 'manual' (backwards compat)
    updatedAt: Date;
}

export interface EffectiveTurnTime {
    effectiveMinutes: number;      // what the ETA formula actually uses
    mode: EtaMode;                 // what's configured
    manualMinutes: number;         // the stored manual value (also the dynamic fallback)
    dynamicMinutes: number | null; // computed from data (null if mode=manual OR sample too small)
    sampleSize: number;            // number of data points that fed the median
    fellBackToManual: boolean;     // true iff mode=dynamic but sampleSize < MIN_DYNAMIC_SAMPLE
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
    phone: string; // required, 10 digits
}

export interface JoinResponseDTO {
    code: string;
    position: number;
    etaAt: string; // ISO8601
    etaMinutes: number;
}

export interface PublicQueueRowDTO {
    position: number; // 1-indexed
    displayName: string; // "Sana P." — first name + last initial only
    partySize: number;
    promisedEtaAt: string; // ISO8601
    waitingSeconds: number; // joinedAt → now
    isMe: boolean; // true if this row corresponds to the viewer's code
    tableNumber?: number; // present iff state === 'seated'
}

export interface StatusResponseDTO {
    code: string;
    position: number;
    etaAt: string | null;
    etaMinutes: number | null; // minutes until seated, from now
    state: PartyState | 'not_found';
    callsMinutesAgo: number[]; // one entry per host Call/Recall (oldest → newest)
    queue: PublicQueueRowDTO[]; // full public waitlist (R3) — oldest position first
    totalParties: number; // length of `queue`
    tableNumber?: number; // present iff viewer is seated
    onMyWayAt?: string; // ISO8601; set after diner clicks "I'm on my way"
}

export interface HostPartyDTO {
    id: string;
    code: string; // party code, e.g. "SKB-7Q3" — used by chat templates on the UI
    position: number;
    name: string;
    partySize: number;
    phoneMasked: string; // "******1234" — never expose full phone
    phoneForDial?: string; // full E.164 (e.g. "+12065551234") — host-only, NEVER in diner APIs
    joinedAt: string; // ISO
    etaAt: string; // ISO
    waitingMinutes: number;
    state: 'waiting' | 'called';
    calls: { minutesAgo: number; smsStatus: string }[];
    unreadChat: number; // count of inbound messages with readByHostAt == null
    onMyWayAt?: string; // ISO8601; set by diner acknowledge (R6)
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
    phoneMasked: string;
    tableNumber: number | null; // assigned at seat time (null only for legacy rows)
    state: 'seated' | 'ordered' | 'served' | 'checkout';
    seatedAt: string;        // ISO
    timeInStateMinutes: number;
    totalTableMinutes: number;
    // Per-transition durations in minutes. waitMinutes is always set for
    // dining rows (they've been seated by definition). The other three are
    // populated only as the party reaches the target state; null beforehand.
    waitMinutes: number;                // joinedAt → seatedAt
    toOrderMinutes: number | null;      // seatedAt → orderedAt
    toServeMinutes: number | null;      // orderedAt → servedAt
    toCheckoutMinutes: number | null;   // servedAt → checkoutAt
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
    // Per-transition durations. All null for no-shows. For departed parties
    // these are the authoritative phase timings used by the host's retro view.
    toOrderMinutes: number | null;      // seatedAt → orderedAt
    toServeMinutes: number | null;      // orderedAt → servedAt
    toCheckoutMinutes: number | null;   // servedAt → checkoutAt
    toDepartMinutes: number | null;     // checkoutAt → departedAt
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
