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
  onMyWayAt: string | null;
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
