import { ActivityIndicator, View } from 'react-native';

import { useChatStore } from '@/state/chat';
import { useWaitlistStore } from '@/state/waitlist';
import { SlideOver } from '@/ui/SlideOver';
import { theme } from '@/ui/theme';

import { ChatComposer } from './ChatComposer';
import { ChatThread } from './ChatThread';

export function ChatSlideOver() {
  const openPartyId = useChatStore((s) => s.openPartyId);
  const closeChat = useChatStore((s) => s.closeChat);
  const threads = useChatStore((s) => s.threads);
  const templates = useChatStore((s) => s.templates);
  const loading = useChatStore((s) => s.loading);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const waiting = useWaitlistStore((s) => s.waiting);
  const party = openPartyId ? waiting.find((p) => p.id === openPartyId) : null;
  const messages = openPartyId ? (threads[openPartyId] ?? []) : [];

  return (
    <SlideOver
      visible={!!openPartyId}
      title={party ? party.name : 'Chat'}
      subtitle={party?.phoneMasked}
      onClose={closeChat}
    >
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.color.accent} />
        </View>
      ) : (
        <ChatThread messages={messages} />
      )}
      <ChatComposer
        templates={templates}
        disabled={!openPartyId}
        onSend={(body) => {
          if (openPartyId) void sendMessage(openPartyId, body);
        }}
      />
    </SlideOver>
  );
}
