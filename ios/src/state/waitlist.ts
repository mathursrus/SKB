import { create } from 'zustand';

import { events, logger } from '@/core/logger';
import type { CompletedParty, CompletedSummary, PartyId, SeatedParty, WaitingParty } from '@/core/party';
import { sortByPosition } from '@/core/waitlist';
import { ApiError } from '@/net/client';
import { waitlist as waitlistApi } from '@/net/endpoints';

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
  poll: () => Promise<void>;
  pollCompleted: () => Promise<void>;
  seatParty: (
    id: PartyId,
    tableNumber: number,
    override?: boolean,
  ) => Promise<{ ok: true } | { ok: false; conflict: { tableNumber: number; occupiedBy: string } } | { ok: false; error: string }>;
  removeParty: (id: PartyId) => Promise<void>;
}

export const useWaitlistStore = create<WaitlistState>((set, get) => ({
  waiting: [],
  seated: [],
  completed: [],
  completedSummary: {
    totalServed: 0,
    totalNoShows: 0,
    avgWaitMinutes: null,
    avgTableOccupancyMinutes: null,
  },
  oldestWaitMinutes: 0,
  avgTurnTimeMinutes: 0,
  lastPolledAt: null,
  error: null,
  isPolling: false,

  poll: async () => {
    if (get().isPolling) return;
    set({ isPolling: true });
    try {
      const [queueResp, diningResp] = await Promise.all([
        waitlistApi.listWaiting(),
        waitlistApi.listSeated(),
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
    try {
      const resp = await waitlistApi.listCompleted();
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
    logger.info(events.seatConfirm, { id, tableNumber, override });
    if (override) logger.warn(events.seatConflictOverride, { id, tableNumber });

    // Optimistic: remove from waiting locally. The real seated party shape
    // won't be fully known until the next poll, so we don't append to seated[]
    // here — we just re-poll on success.
    const before = get().waiting;
    set({ waiting: before.filter((p) => p.id !== id) });

    try {
      await waitlistApi.seat(id, tableNumber, override);
      await get().poll();
      return { ok: true } as const;
    } catch (err) {
      // Rollback the optimistic removal
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
    const before = get().waiting;
    set({ waiting: before.filter((p) => p.id !== id) });
    try {
      await waitlistApi.noShow(id);
    } catch (err) {
      set({ waiting: before });
      throw err;
    }
  },
}));
