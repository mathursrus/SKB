// ============================================================================
// SKB - Queue types (domain + API DTOs)
// ============================================================================

// Structured address — so the IVR script, web page, and maps embed all
// render from the same source. `street` is the single most load-bearing
// field; city/state/zip are US-shaped.
export interface LocationAddress {
    street: string; // "12 Bellevue Way SE"
    city: string;   // "Bellevue"
    state: string;  // "WA" — 2-letter US state code
    zip: string;    // "98004" or "98004-1234"
}

// Weekly hours with closed-day support. A day is either the literal string
// "closed" or a DayHours object with optional lunch and dinner windows.
// Times are HH:mm in 24h format (e.g., "11:30", "21:30").
export interface ServiceWindow {
    open: string;  // HH:mm 24h
    close: string; // HH:mm 24h
}

export interface DayHours {
    lunch?: ServiceWindow;
    dinner?: ServiceWindow;
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface GuestFeatures {
    sms: boolean;
    chat: boolean;
    order: boolean;
}

export type WeeklyHours = {
    [K in DayOfWeek]?: DayHours | 'closed';
};

// Multi-tenant: each restaurant is a "location" identified by a slug.
export interface Location {
    _id: string;         // slug, e.g., "skb", "skb-demo"
    name: string;        // display name, e.g., "Shri Krishna Bhavan"
    pin: string;         // host-stand PIN for this location
    frontDeskPhone?: string; // 10-digit phone for IVR transfer (large parties + press-0 transfer)
    cateringPhone?: string;  // 10-digit phone for IVR catering transfer (press-5 branch)
    voiceEnabled?: boolean;   // location-level intent to expose IVR entry
    voiceLargePartyThreshold?: number; // override for IVR transfer threshold
    createdAt: Date;
    publicUrl?: string;       // public HTTPS base URL, e.g., "https://skb.azurewebsites.net"
    publicHost?: string;      // custom public host for host-header routing, e.g., "skbbellevue.com" (no scheme, no trailing slash)
    googlePlaceId?: string;   // Google Maps Place ID, e.g., "ChIJ..."
    address?: LocationAddress; // admin-configurable street/city/state/zip (issue #45)
    hours?: WeeklyHours;       // admin-configurable weekly hours with closed-day support (issue #45)
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
    // Public website template + structured content (issue #56). Absent
    // template ⇒ 'saffron' (preserves existing SKB look). Absent content
    // fields fall back to template defaults.
    websiteTemplate?: WebsiteTemplateKey;
    content?: LocationContent;
    menu?: LocationMenu;       // structured menu (sections + items, issue #51)
    guestFeatures?: GuestFeatures; // admin-controlled guest capability toggles

    // Multi-tenant SMS via shared OSH number (issue #69). `smsSenderName` is
    // prefixed onto every outbound SMS body so diners can tell which restaurant
    // a text is about even though many restaurants share the platform number.
    // Defaults to `name` if absent. `twilioVoiceNumber*` fields are populated
    // only when a tenant opts into their own dedicated IVR long code; voice
    // is not subject to TFV/10DLC so provisioning is fast.
    smsSenderName?: string;
    twilioVoiceNumber?: string;      // E.164, e.g. "+12065550142"
    twilioVoiceNumberSid?: string;   // Twilio IncomingPhoneNumber SID

    // Owner-onboarding wizard state (issue #54, spec §6.2). Each completed
    // step ID is pushed in. Wizard is hidden client-side once all four are
    // present. Possible values: 'basics', 'template', 'menu', 'staff'.
    onboardingSteps?: string[];
}

// Website template key + structured editable content (issue #56). The owner
// picks a template; the renderer resolves per-page HTML and substitutes
// `content` fields. Absent fields fall back to template defaults.
export type WebsiteTemplateKey = 'saffron' | 'slate';

export interface LocationKnownForItem {
    title: string;  // "Tonkotsu Shio"
    desc: string;   // "36-hour pork broth."
    image: string;  // "/r/<slug>/assets/<file>" or absolute URL
}

export interface LocationContent {
    heroHeadline?: string;      // one line, shown in the hero
    heroSubhead?: string;       // two lines, shown under the hero
    knownFor?: LocationKnownForItem[]; // up to 3 cards
    about?: string;             // free text, markdown-lite (paragraphs only in v1)
    contactEmail?: string;      // optional override for the contact page
    instagramHandle?: string;   // "@example" with or without the leading @
    reservationsNote?: string;  // "Walk-ins welcome" etc.
}

// Structured menu (issue #51 follow-up). The restaurant can author an
// ordered list of sections, each holding items with name / description /
// price. The public /menu route reads this directly if present; the legacy
// `menuUrl` still works as an external-link alternative for operators who
// keep their menu elsewhere (PDF / Squarespace / etc).
export interface MenuItem {
    id: string;                 // short random id, client-minted
    name: string;
    description?: string;
    price?: string;             // display string ("$12.50", "12", "market price")
    image?: string;             // "/assets/<slug>/menu/<file>" or absolute URL
    availability?: 'available' | 'sold_out';
    requiredIngredients?: string[];
    optionalIngredients?: string[];
}
export interface MenuSection {
    id: string;                 // short random id, client-minted
    title: string;              // "Appetizers", "Dosas", "Drinks", ...
    items: MenuItem[];
}
export interface LocationMenu {
    sections: MenuSection[];
    updatedAt?: Date;
}

// A safe projection of Location suitable for exposure via the public config
// endpoint. Excludes `pin` and any operational internals. Used by the new
// diner-facing website pages to render the address, hours, and phone.
export interface PublicLocation {
    name: string;
    address?: LocationAddress;
    hours?: WeeklyHours;
    frontDeskPhone?: string;
    publicUrl?: string;
    websiteTemplate?: WebsiteTemplateKey;
    content?: LocationContent;
    guestFeatures?: GuestFeatures;
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
    // SMS consent — TFV 30513 requires that signing up for the service
    // NOT bundle SMS consent as a prerequisite. Missing / false means
    // skip all SMS (join confirmation, notify, chat) for this party.
    smsConsent?: boolean;
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

export interface GuestCartLineInputDTO {
    menuItemId: string;
    quantity: number;
    notes?: string;
    selectedOptions?: string[];
}

export interface GuestCartLineDTO {
    menuItemId: string;
    sectionId: string;
    sectionTitle: string;
    name: string;
    description?: string;
    price?: string;
    image?: string;
    quantity: number;
    notes?: string;
    requiredIngredients: string[];
    optionalIngredients: string[];
    selectedOptions: string[];
    availability: 'available' | 'sold_out';
}

export interface GuestCartDTO {
    code: string;
    state: 'draft' | 'placed' | 'none';
    lines: GuestCartLineDTO[];
    totalQuantity: number;
    updatedAt: string | null;
    placedAt?: string;
}

export interface HostPartyOrderDTO {
    code: string;
    state: 'draft' | 'placed' | 'none';
    lines: GuestCartLineDTO[];
    totalQuantity: number;
    updatedAt: string | null;
    placedAt?: string;
}

export interface JoinRequestDTO {
    name: string;
    partySize: number;
    phone: string; // required, 10 digits
    smsConsent?: boolean; // explicit opt-in; missing/false = no SMS at all
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
    order?: GuestCartDTO | null;
    canManageOrder?: boolean;
    canPlaceOrder?: boolean;
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

export type AnalyticsStage = 'joined' | 'seated' | 'ordered' | 'served' | 'checkout' | 'departed';

export interface AnalyticsDTO {
    histograms: PhaseHistogram[];
    dateRange: { from: string; to: string };
    partySizeFilter: string; // "all" | "1-2" | "3-4" | "5+"
    totalParties: number;
    selectedRange?: {
        startStage: AnalyticsStage;
        endStage: AnalyticsStage;
        label: string;
    };
}

export interface ErrorDTO {
    error: string;
    field?: string;
}
