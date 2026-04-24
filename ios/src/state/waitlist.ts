import { create } from 'zustand';

import { events, logger } from '@/core/logger';
import type { CompletedParty, CompletedSummary, PartyId, SeatedParty, WaitingParty } from '@/core/party';
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
}));
