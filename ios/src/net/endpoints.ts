import type {
  ChatMessage,
  ChatTemplates,
  ChatThread,
  CompletedParty,
  CompletedSummary,
  PartyId,
  SeatedParty,
  WaitingParty,
} from '@/core/party';

import { request } from './client';

export interface LoginResponse {
  ok: true;
}

export const auth = {
  login: (pin: string) => request<LoginResponse>('/host/login', { method: 'POST', body: { pin } }),
  logout: () => request<{ ok: true }>('/host/logout', { method: 'POST' }),
};

export interface HostQueueResponse {
  parties: WaitingParty[];
  oldestWaitMinutes: number;
  avgTurnTimeMinutes: number;
}

export interface HostDiningResponse {
  parties: SeatedParty[];
  diningCount: number;
}

export interface HostCompletedResponse extends CompletedSummary {
  parties: CompletedParty[];
}

export interface SeatResponse {
  ok: true;
}

export interface SeatConflictError {
  error: 'table_occupied';
  tableNumber: number;
  occupiedBy: string;
}

export const waitlist = {
  listWaiting: () => request<HostQueueResponse>('/host/queue'),
  listSeated: () => request<HostDiningResponse>('/host/dining'),
  listCompleted: () => request<HostCompletedResponse>('/host/completed'),

  /**
   * Issue #30 R14–R17 seat action. The backend exposes seating as a "remove"
   * with reason=seated rather than a standalone route — this wrapper hides
   * that wart from the rest of the iOS app.
   */
  seat: (id: PartyId, tableNumber: number, override = false) =>
    request<SeatResponse>(`/host/queue/${id}/remove`, {
      method: 'POST',
      body: { reason: 'seated', tableNumber, override },
    }),

  noShow: (id: PartyId) =>
    request<{ ok: true }>(`/host/queue/${id}/remove`, {
      method: 'POST',
      body: { reason: 'no_show' },
    }),

  advance: (id: PartyId, state: 'ordered' | 'served' | 'checkout' | 'departed') =>
    request<{ ok: true }>(`/host/queue/${id}/advance`, {
      method: 'POST',
      body: { state },
    }),
};

export const chat = {
  /** Templates require a code query parameter; the backend substitutes code-specific copy. */
  templates: (code: string) =>
    request<ChatTemplates>(`/host/chat/templates?code=${encodeURIComponent(code)}`),

  thread: (id: PartyId) => request<ChatThread>(`/host/queue/${id}/chat`),

  send: (id: PartyId, body: string) =>
    request<{ ok: true; smsStatus: string; message: ChatMessage }>(
      `/host/queue/${id}/chat`,
      { method: 'POST', body: { body } },
    ),

  markRead: (id: PartyId) =>
    request<{ ok: true; updated: number }>(`/host/queue/${id}/chat/read`, { method: 'PATCH' }),
};

export const calls = {
  /**
   * Fire-and-forget log for when the host taps the device tel: dial link.
   * This does NOT initiate a server-side call — that's the Custom Call action,
   * which posts to /host/queue/:id/call.
   */
  log: (id: PartyId) => request<{ ok: true }>(`/host/queue/${id}/call-log`, { method: 'POST' }),

  /** Server-initiated SMS "call" — the existing Custom Call action. */
  customCall: (id: PartyId) =>
    request<{ ok: true; smsStatus: string }>(`/host/queue/${id}/call`, { method: 'POST' }),
};

export const stats = {
  getStats: () => request<Record<string, unknown>>('/host/stats'),
  getSettings: () =>
    request<{
      avgTurnTimeMinutes: number;
      etaMode: 'manual' | 'dynamic';
      effectiveMinutes: number;
    }>('/host/settings'),
};
