import { useEffect, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { ChatMessage } from '@/core/party';
import { theme } from '@/ui/theme';

interface Props {
  messages: readonly ChatMessage[];
  smsCapable?: boolean;
}

/**
 * Per-message status decoration. Mirrors the website's chat status icons:
 *   - sent → ✓ (faint, beside timestamp)
 *   - failed → "Not delivered" red label
 *   - not_configured → "SMS unavailable" or "web only" depending on
 *     whether the diner consented at all (the banner above the thread
 *     covers the broader "this thread is web-only" notice; here we just
 *     mark each individual message that didn't go over SMS).
 */
function statusDecoration(
  smsStatus: string | undefined,
  smsCapable: boolean,
): { label: string | null; failed: boolean; muted: boolean } {
  if (smsStatus === 'failed') return { label: 'Not delivered', failed: true, muted: false };
  if (smsStatus === 'not_configured') {
    return { label: smsCapable ? 'SMS unavailable' : 'web only', failed: false, muted: true };
  }
  if (smsStatus === 'sent') return { label: '✓', failed: false, muted: false };
  return { label: null, failed: false, muted: false };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ChatThread({ messages, smsCapable = true }: Props) {
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
        const isOut = item.direction === 'outbound';
        const deco = isOut ? statusDecoration(item.smsStatus, smsCapable) : null;
        return (
          <View
            style={[
              styles.msg,
              isOut ? styles.msgOut : styles.msgIn,
              deco?.failed && styles.msgFailed,
            ]}
          >
            <Text style={isOut ? styles.bodyOut : styles.bodyIn}>{item.body}</Text>
            <View style={styles.metaLine}>
              <Text
                style={[
                  styles.timestamp,
                  isOut && styles.timestampOut,
                  deco?.failed && styles.timestampFailed,
                ]}
              >
                {formatTime(item.at)}
              </Text>
              {deco?.label !== null && deco?.label !== undefined && (
                <Text
                  style={[
                    styles.statusTag,
                    isOut && styles.statusTagOut,
                    deco.failed && styles.statusTagFailed,
                    deco.muted && styles.statusTagMuted,
                  ]}
                >
                  {deco.label}
                </Text>
              )}
            </View>
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
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusTag: {
    fontSize: 10,
    color: theme.color.textMuted,
    fontWeight: '600',
  },
  statusTagOut: { color: 'rgba(42,26,0,0.7)' },
  statusTagFailed: { color: theme.color.warn, fontWeight: '700' },
  statusTagMuted: { color: theme.color.textMuted, fontStyle: 'italic' },
  empty: {
    color: theme.color.textMuted,
    textAlign: 'center',
    marginTop: theme.space.xl,
  },
});
