export type PartyState =
  | 'waiting'
  | 'called'
  | 'seated'
  | 'ordered'
  | 'served'
  | 'checkout'
  | 'departed'
  | 'no_show';

export type PartyId = string;

/**
 * Per-row sentiment matches the website host stand exactly. The
 * `sentimentSource` field disambiguates whether the value is the host's
 * manual override or the system's automatic derivation from wait time —
 * the picker UI defaults to "Auto" when the source is automatic, and to
 * the explicit emoji when the host has set an override.
 */
export type HostSentiment = 'happy' | 'neutral' | 'upset';
export type HostSentimentSource = 'manual' | 'automatic';

/**
 * Waiting / called row. Matches the backend HostPartyDTO returned by
 * GET /r/:loc/host/queue → { parties: WaitingParty[] }.
 */
export interface WaitingParty {
  id: PartyId;
  code: string;
  position: number;
  name: string;
  partySize: number;
  phoneMasked: string;
  phoneForDial: string | null;
  joinedAt: string;
  etaAt: string;
  waitingMinutes: number;
  state: 'waiting' | 'called';
  unreadChat: number;
  // Whether the diner consented to SMS at join time. Drives the Notify
  // button's "this will SMS them" path on the host side. Combined with
  // the tenant-level `features.chat`, the host's compose surface is
  // reachable when EITHER channel can deliver.
  smsCapable?: boolean;
  sentiment?: HostSentiment;
  sentimentSource?: HostSentimentSource;
  // Set ONLY after the diner taps "I'm on my way". The server omits the
  // field entirely when unset (so it arrives as `undefined`, not `null`)
  // — every consumer must check `onMyWayAt != null` (or just truthiness)
  // rather than `!== null`, which would render the badge for every party.
  onMyWayAt?: string;
  calls: { minutesAgo: number; smsStatus: string }[];
}

/**
 * Seated / dining row. Matches HostDiningPartyDTO returned by
 * GET /r/:loc/host/dining → { parties: SeatedParty[] }.
 */
export interface SeatedParty {
  id: PartyId;
  name: string;
  partySize: number;
  phoneMasked: string;
  tableNumber: number | null;
  state: 'seated' | 'ordered' | 'served' | 'checkout';
  seatedAt: string;
  timeInStateMinutes: number;
  totalTableMinutes: number;
  waitMinutes: number;
  toOrderMinutes: number | null;
  toServeMinutes: number | null;
  toCheckoutMinutes: number | null;
  sentiment?: HostSentiment;
  sentimentSource?: HostSentimentSource;
}

/**
 * Completed row for the host's retrospective view. Matches
 * HostCompletedPartyDTO returned by GET /r/:loc/host/completed →
 * { parties: CompletedParty[], totalServed, totalNoShows, avgWaitMinutes,
 *   avgTableOccupancyMinutes }.
 */
export interface CompletedParty {
  id: PartyId;
  name: string;
  partySize: number;
  state: 'departed' | 'no_show';
  joinedAt: string;
  waitTimeMinutes: number;
  tableTimeMinutes: number | null;
  totalTimeMinutes: number;
  toOrderMinutes: number | null;
  toServeMinutes: number | null;
  toCheckoutMinutes: number | null; // Served → asking for the check ("Dining" on the web)
  toDepartMinutes: number | null;   // Asking for check → leaving ("Paying" on the web)
}

export interface CompletedSummary {
  totalServed: number;
  totalNoShows: number;
  avgWaitMinutes: number | null;
  avgTableOccupancyMinutes: number | null;
}

export interface ChatMessage {
  direction: 'inbound' | 'outbound';
  body: string;
  at: string;
  smsStatus?: string;
}

export interface ChatThread {
  entryId: PartyId;
  messages: ChatMessage[];
  unread: number;
  hasMore: boolean;
}

export interface ChatTemplates {
  almostReady: string;
  needMoreTime: string;
  lostYou: string;
}

export const ACTIVE_DINING_STATES: readonly SeatedParty['state'][] = [
  'seated',
  'ordered',
  'served',
  'checkout',
];

export function isActiveDining(state: PartyState): boolean {
  return (
    state === 'seated' ||
    state === 'ordered' ||
    state === 'served' ||
    state === 'checkout'
  );
}

export function isWaiting(state: PartyState): boolean {
  return state === 'waiting' || state === 'called';
}

export function hasDialablePhone(party: Pick<WaitingParty, 'phoneForDial'>): boolean {
  return typeof party.phoneForDial === 'string' && party.phoneForDial.length >= 4;
}
