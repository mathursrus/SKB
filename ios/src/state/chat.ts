import { create } from 'zustand';

import { events, logger } from '@/core/logger';
import type { ChatMessage, PartyId } from '@/core/party';
import { getChatErrorMessage } from '@/features/chat/chatErrors';
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
  // True iff the diner consented to SMS at join time. Drives the
  // "web only" banner inside the slide-over so the host knows the
  // outbound message will reach the diner via in-app chat alone.
  openPartySmsCapable: boolean;
  threads: Record<PartyId, ChatMessage[]>;
  templates: ChatTemplate[];
  loading: boolean;
  error: string | null;
  openChat: (partyId: PartyId, code: string, smsCapable: boolean) => Promise<void>;
  closeChat: () => void;
  sendMessage: (partyId: PartyId, body: string) => Promise<void>;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  openPartyId: null,
  openPartyCode: null,
  openPartySmsCapable: true,
  threads: {},
  templates: FALLBACK_TEMPLATES,
  loading: false,
  error: null,

  openChat: async (partyId, code, smsCapable) => {
    const locationId = useAuthStore.getState().locationId;
    if (!locationId) return;

    logger.info(events.chatOpen, { partyId });
    set({
      openPartyId: partyId,
      openPartyCode: code,
      openPartySmsCapable: smsCapable,
      loading: true,
      error: null,
    });
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
      set({ loading: false, error: getChatErrorMessage(err) });
    }
  },

  closeChat: () => set({ openPartyId: null, openPartyCode: null, openPartySmsCapable: true, error: null }),

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
      error: null,
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
      // Issue #102 #3: previously we stripped the optimistic message on
      // failure, which made the host's text appear and then vanish — no
      // recourse, no retry. Mark it as `failed` instead so it stays in
      // the thread with a visible status, and surface a friendly error
      // banner via `error`. The host can read what they tried to send,
      // copy it, or retype.
      set((s) => ({
        threads: {
          ...s.threads,
          [partyId]: markOptimisticFailed(s.threads[partyId] ?? [], optimistic),
        },
        error: getChatErrorMessage(err),
      }));
    }
  },
  clearError: () => set({ error: null }),
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

function markOptimisticFailed(thread: ChatMessage[], optimistic: ChatMessage): ChatMessage[] {
  const idx = thread.lastIndexOf(optimistic);
  if (idx < 0) return thread;
  const failed: ChatMessage = { ...optimistic, smsStatus: 'failed' };
  return [...thread.slice(0, idx), failed, ...thread.slice(idx + 1)];
}
