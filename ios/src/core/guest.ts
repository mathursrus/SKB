export interface QueueState {
  partiesWaiting: number;
  etaForNewPartyMinutes: number;
  avgTurnTimeMinutes: number;
}

export interface PublicQueueRow {
  position: number;
  displayName: string;
  partySize: number;
  promisedEtaAt: string;
  waitingSeconds: number;
  isMe: boolean;
  tableNumber?: number;
}

export interface GuestStatus {
  code: string;
  position: number;
  etaAt: string | null;
  etaMinutes: number | null;
  state: 'waiting' | 'called' | 'seated' | 'ordered' | 'served' | 'checkout' | 'departed' | 'no_show' | 'not_found';
  callsMinutesAgo: number[];
  queue: PublicQueueRow[];
  totalParties: number;
  tableNumber?: number;
  onMyWayAt?: string;
}

export interface GuestChatMessage {
  direction: 'inbound' | 'outbound';
  body: string;
  at: string;
  smsStatus?: string;
}

export interface GuestChatThread {
  entryId: string;
  messages: GuestChatMessage[];
  unread: number;
  hasMore: boolean;
}
