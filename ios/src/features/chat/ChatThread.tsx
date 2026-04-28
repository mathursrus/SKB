import { useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { ChatMessage } from '@/core/party';
import { theme } from '@/ui/theme';

interface Props {
  messages: readonly ChatMessage[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ChatThread({ messages }: Props) {
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length]);

  return (
    <FlatList
      ref={listRef}
      data={messages as ChatMessage[]}
      keyExtractor={(m, idx) => `${m.at}-${idx}-${m.direction}`}
      style={styles.list}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => {
        const failed = item.smsStatus === 'failed';
        return (
          <View
            style={[
              styles.msg,
              item.direction === 'outbound' ? styles.msgOut : styles.msgIn,
              failed && styles.msgFailed,
            ]}
          >
            <Text style={item.direction === 'outbound' ? styles.bodyOut : styles.bodyIn}>
              {item.body}
            </Text>
            <Text
              style={[
                styles.timestamp,
                item.direction === 'outbound' && styles.timestampOut,
                failed && styles.timestampFailed,
              ]}
            >
              {failed ? 'Not delivered' : formatTime(item.at)}
            </Text>
          </View>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    padding: theme.space.lg,
    gap: 10,
  },
  msg: {
    maxWidth: '78%',
    padding: 10,
    borderRadius: 14,
  },
  msgIn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderBottomLeftRadius: 4,
  },
  msgOut: {
    alignSelf: 'flex-end',
    backgroundColor: theme.color.accent,
    borderBottomRightRadius: 4,
  },
  msgFailed: {
    opacity: 0.7,
    backgroundColor: 'rgba(185, 28, 28, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.45)',
  },
  bodyIn: {
    color: theme.color.text,
    fontSize: 14,
    lineHeight: 19,
  },
  bodyOut: {
    color: '#2a1a00',
    fontSize: 14,
    lineHeight: 19,
  },
  timestamp: {
    color: theme.color.textMuted,
    fontSize: 10,
    marginTop: 4,
  },
  timestampOut: {
    color: 'rgba(42,26,0,0.6)',
  },
  timestampFailed: {
    color: theme.color.warn,
    fontWeight: '700',
  },
  empty: {
    color: theme.color.textMuted,
    textAlign: 'center',
    marginTop: theme.space.xl,
  },
});
