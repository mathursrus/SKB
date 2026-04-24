import { create } from 'zustand';

import { events, logger } from '@/core/logger';
import type { ChatMessage, PartyId } from '@/core/party';
import { chat as chatApi } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';

const FALLBACK_TEMPLATES: ChatTemplate[] = [
  { id: 'almost', label: 'Almost ready', body: 'Your table is almost ready' },
  { id: 'more_time', label: 'More time', body: 'Need 5 more minutes?' },
  { id: 'lost', label: 'Still here?', body: 'We lost you - are you still here?' },
];

export interface ChatTemplate {
  id: string;
  label: string;
  body: string;
}

interface ChatState {
  openPartyId: PartyId | null;
  openPartyCode: string | null;
  threads: Record<PartyId, ChatMessage[]>;
  templates: ChatTemplate[];
  loading: boolean;
  error: string | null;
  openChat: (partyId: PartyId, code: string) => Promise<void>;
  closeChat: () => void;
  sendMessage: (partyId: PartyId, body: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  openPartyId: null,
  openPartyCode: null,
  threads: {},
  templates: FALLBACK_TEMPLATES,
  loading: false,
  error: null,

  openChat: async (partyId, code) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return;

    logger.info(events.chatOpen, { partyId });
    set({ openPartyId: partyId, openPartyCode: code, loading: true, error: null });
    try {
      const [thread, templates] = await Promise.all([
        chatApi.thread(locationId, partyId),
        chatApi.templates(locationId, code).catch(() => null),
      ]);
      set((s) => ({
        threads: { ...s.threads, [partyId]: thread.messages },
        templates:
          templates !== null
            ? [
                { id: 'almost', label: 'Almost ready', body: templates.almostReady },
                { id: 'more_time', label: 'More time', body: templates.needMoreTime },
                { id: 'lost', label: 'Still here?', body: templates.lostYou },
              ]
            : s.templates,
        loading: false,
      }));
      void chatApi.markRead(locationId, partyId).catch(() => {});
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  closeChat: () => set({ openPartyId: null, openPartyCode: null }),

  sendMessage: async (partyId, body) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return;

    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    logger.info(events.chatSend, { partyId, length: trimmed.length });

    const optimistic: ChatMessage = {
      direction: 'outbound',
      body: trimmed,
      at: new Date().toISOString(),
    };
    set((s) => ({
      threads: {
        ...s.threads,
        [partyId]: [...(s.threads[partyId] ?? []), optimistic],
      },
    }));
    try {
      const { message } = await chatApi.send(locationId, partyId, trimmed);
      set((s) => ({
        threads: {
          ...s.threads,
          [partyId]: replaceOptimistic(s.threads[partyId] ?? [], optimistic, message),
        },
      }));
    } catch (err) {
      set((s) => ({
        threads: {
          ...s.threads,
          [partyId]: (s.threads[partyId] ?? []).filter((m) => m !== optimistic),
        },
        error: (err as Error).message,
      }));
    }
  },
}));

function replaceOptimistic(
  thread: ChatMessage[],
  optimistic: ChatMessage,
  server: ChatMessage,
): ChatMessage[] {
  const idx = thread.lastIndexOf(optimistic);
  if (idx < 0) return [...thread, server];
  return [...thread.slice(0, idx), server, ...thread.slice(idx + 1)];
}
