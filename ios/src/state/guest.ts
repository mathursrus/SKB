import { create } from 'zustand';

import type { GuestChatThread, GuestStatus, QueueState } from '@/core/guest';
import { guest as guestApi } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';

interface GuestState {
  queueState: QueueState | null;
  trackedCode: string;
  status: GuestStatus | null;
  thread: GuestChatThread | null;
  loading: boolean;
  joining: boolean;
  refreshing: boolean;
  error: string | null;
  reset: () => void;
  setTrackedCode: (code: string) => void;
  loadOverview: () => Promise<void>;
  trackParty: (code: string) => Promise<void>;
  joinQueue: (body: { name: string; partySize: number; phone: string; smsConsent: boolean }) => Promise<string | null>;
  sendMessage: (body: string) => Promise<void>;
  acknowledge: () => Promise<void>;
}

export const useGuestStore = create<GuestState>((set, get) => ({
  queueState: null,
  trackedCode: '',
  status: null,
  thread: null,
  loading: false,
  joining: false,
  refreshing: false,
  error: null,

  reset: () => set({
    queueState: null,
    trackedCode: '',
    status: null,
    thread: null,
    loading: false,
    joining: false,
    refreshing: false,
    error: null,
  }),

  setTrackedCode: (code) => set({ trackedCode: code.trim().toUpperCase() }),

  loadOverview: async () => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return;
    try {
      const queueState = await guestApi.state(locationId);
      set({ queueState, error: null });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  trackParty: async (code) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return;
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;

    set({ refreshing: true, error: null, trackedCode: normalized });
    try {
      const [status, thread] = await Promise.all([
        guestApi.status(locationId, normalized),
        guestApi.thread(locationId, normalized).catch(() => null),
      ]);
      set({
        status,
        thread,
        refreshing: false,
      });
    } catch (err) {
      set({
        refreshing: false,
        error: (err as Error).message,
      });
    }
  },

  joinQueue: async (body) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return null;
    set({ joining: true, error: null });
    try {
      const joined = await guestApi.join(locationId, body);
      await get().trackParty(joined.code);
      set({ joining: false });
      return joined.code;
    } catch (err) {
      set({ joining: false, error: (err as Error).message });
      return null;
    }
  },

  sendMessage: async (body) => {
    const locationId = useAuthStore.getState().locationId;
    const code = get().trackedCode;
    const trimmed = body.trim();
    if (!locationId || !code || !trimmed) return;

    const optimistic = {
      direction: 'outbound' as const,
      body: trimmed,
      at: new Date().toISOString(),
    };
    set((state) => ({
      thread: state.thread
        ? { ...state.thread, messages: [...state.thread.messages, optimistic] }
        : {
            entryId: code,
            messages: [optimistic],
            unread: 0,
            hasMore: false,
          },
    }));

    try {
      await guestApi.sendMessage(locationId, code, trimmed);
      await get().trackParty(code);
    } catch (err) {
      set({ error: (err as Error).message });
      await get().trackParty(code);
    }
  },

  acknowledge: async () => {
    const locationId = useAuthStore.getState().locationId;
    const code = get().trackedCode;
    if (!locationId || !code) return;
    try {
      await guestApi.acknowledge(locationId, code);
      await get().trackParty(code);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
