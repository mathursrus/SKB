import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const error = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);
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
      {error !== null && (
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={`${error}. Tap to dismiss.`}
          onPress={clearError}
          style={styles.errorBanner}
        >
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>Dismiss</Text>
        </Pressable>
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

const styles = StyleSheet.create({
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(185, 28, 28, 0.35)',
  },
  errorText: {
    flex: 1,
    color: theme.color.warn,
    fontSize: 13,
    fontWeight: '600',
  },
  errorDismiss: {
    color: theme.color.warn,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
