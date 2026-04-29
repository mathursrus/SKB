import { create } from 'zustand';

import { events, logger } from '@/core/logger';
import type { CompletedParty, CompletedSummary, HostSentiment, PartyId, SeatedParty, WaitingParty } from '@/core/party';
import { sortByPosition } from '@/core/waitlist';
import { ApiError } from '@/net/client';
import { waitlist as waitlistApi } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';

interface WaitlistState {
  waiting: WaitingParty[];
  seated: SeatedParty[];
  completed: CompletedParty[];
  completedSummary: CompletedSummary;
  oldestWaitMinutes: number;
  avgTurnTimeMinutes: number;
  lastPolledAt: number | null;
  error: string | null;
  isPolling: boolean;
  reset: () => void;
  poll: () => Promise<void>;
  pollCompleted: () => Promise<void>;
  seatParty: (
    id: PartyId,
    tableNumber: number,
    override?: boolean,
  ) => Promise<{ ok: true } | { ok: false; conflict: { tableNumber: number; occupiedBy: string } } | { ok: false; error: string }>;
  removeParty: (id: PartyId) => Promise<void>;
  setSentiment: (id: PartyId, sentiment: HostSentiment | null) => Promise<boolean>;
  setEta: (id: PartyId, etaAt: Date) => Promise<boolean>;
}

const emptySummary: CompletedSummary = {
  totalServed: 0,
  totalNoShows: 0,
  avgWaitMinutes: null,
  avgTableOccupancyMinutes: null,
};

export const useWaitlistStore = create<WaitlistState>((set, get) => ({
  waiting: [],
  seated: [],
  completed: [],
  completedSummary: emptySummary,
  oldestWaitMinutes: 0,
  avgTurnTimeMinutes: 0,
  lastPolledAt: null,
  error: null,
  isPolling: false,

  reset: () => set({
    waiting: [],
    seated: [],
    completed: [],
    completedSummary: emptySummary,
    oldestWaitMinutes: 0,
    avgTurnTimeMinutes: 0,
    lastPolledAt: null,
    error: null,
    isPolling: false,
  }),

  poll: async () => {
    if (get().isPolling) return;
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return;

    set({ isPolling: true });
    try {
      const [queueResp, diningResp] = await Promise.all([
        waitlistApi.listWaiting(locationId),
        waitlistApi.listSeated(locationId),
      ]);
      logger.debug(events.waitlistPoll, {
        waiting: queueResp.parties.length,
        seated: diningResp.parties.length,
      });
      set({
        waiting: sortByPosition(queueResp.parties),
        seated: diningResp.parties,
        oldestWaitMinutes: queueResp.oldestWaitMinutes,
        avgTurnTimeMinutes: queueResp.avgTurnTimeMinutes,
        lastPolledAt: Date.now(),
        error: null,
        isPolling: false,
      });
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn(events.waitlistPollError, { msg });
      set({ error: msg, isPolling: false });
    }
  },

  pollCompleted: async () => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return;
    try {
      const resp = await waitlistApi.listCompleted(locationId);
      set({
        completed: resp.parties,
        completedSummary: {
          totalServed: resp.totalServed,
          totalNoShows: resp.totalNoShows,
          avgWaitMinutes: resp.avgWaitMinutes,
          avgTableOccupancyMinutes: resp.avgTableOccupancyMinutes,
        },
      });
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn(events.waitlistPollError, { msg });
    }
  },

  seatParty: async (id, tableNumber, override = false) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return { ok: false, error: 'No restaurant selected' } as const;

    logger.info(events.seatConfirm, { id, tableNumber, override });
    if (override) logger.warn(events.seatConflictOverride, { id, tableNumber });

    const before = get().waiting;
    set({ waiting: before.filter((p) => p.id !== id) });

    try {
      await waitlistApi.seat(locationId, id, tableNumber, override);
      await get().poll();
      return { ok: true } as const;
    } catch (err) {
      set({ waiting: before });
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { tableNumber?: number; occupiedBy?: string } | undefined;
        return {
          ok: false,
          conflict: {
            tableNumber: body?.tableNumber ?? tableNumber,
            occupiedBy: body?.occupiedBy ?? 'another party',
          },
        } as const;
      }
      return { ok: false, error: (err as Error).message } as const;
    }
  },

  removeParty: async (id) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) throw new Error('No restaurant selected');

    const before = get().waiting;
    set({ waiting: before.filter((p) => p.id !== id) });
    try {
      await waitlistApi.noShow(locationId, id);
    } catch (err) {
      set({ waiting: before });
      throw err;
    }
  },

  setSentiment: async (id, sentiment) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return false;
    // Optimistic patch into both lists — sentiment is editable on
    // Waiting AND Seated rows on the server side. Mirrors the
    // web's behaviour where the badge updates immediately and the
    // refresh-poll reconciles the automatic-derivation.
    const before = { waiting: get().waiting, seated: get().seated };
    const apply = <T extends { id: PartyId; sentiment?: HostSentiment; sentimentSource?: 'manual' | 'automatic' }>(
      list: T[],
    ): T[] =>
      list.map((p) =>
        p.id === id
          ? sentiment === null
            ? { ...p, sentiment: undefined, sentimentSource: 'automatic' as const }
            : { ...p, sentiment, sentimentSource: 'manual' as const }
          : p,
      );
    set({ waiting: apply(before.waiting), seated: apply(before.seated) });
    try {
      await waitlistApi.setSentiment(locationId, id, sentiment);
      // Re-poll so the automatic derivation comes back from the server
      // when the host clears the override. The optimistic patch only
      // sets `sentiment: undefined`; the server will fill in the real
      // automatic value on the next poll.
      void get().poll();
      return true;
    } catch (err) {
      set({ waiting: before.waiting, seated: before.seated });
      logger.warn(events.waitlistPollError, { msg: (err as Error).message });
      return false;
    }
  },

  setEta: async (id, etaAt) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return false;
    if (Number.isNaN(etaAt.valueOf())) return false;
    const isoEta = etaAt.toISOString();
    const before = get().waiting;
    set({
      waiting: before.map((p) => (p.id === id ? { ...p, etaAt: isoEta } : p)),
    });
    try {
      await waitlistApi.setEta(locationId, id, isoEta);
      void get().poll();
      return true;
    } catch (err) {
      set({ waiting: before });
      logger.warn(events.waitlistPollError, { msg: (err as Error).message });
      return false;
    }
  },
}));
