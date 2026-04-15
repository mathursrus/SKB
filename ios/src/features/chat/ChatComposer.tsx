import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ChatTemplate } from '@/state/chat';
import { theme } from '@/ui/theme';

interface Props {
  templates: readonly ChatTemplate[];
  onSend: (body: string) => void;
  disabled?: boolean;
}

export function ChatComposer({ templates, onSend, disabled }: Props) {
  const [draft, setDraft] = useState('');

  function send(body: string) {
    if (disabled) return;
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    onSend(trimmed);
    setDraft('');
  }

  return (
    <View>
      <View style={styles.quicks}>
        {templates.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`Send quick reply: ${t.label}`}
            style={styles.quickButton}
            onPress={() => send(t.body)}
            disabled={disabled}
          >
            <Text style={styles.quickText}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message composer"
          style={styles.input}
          placeholder="Type a message…"
          placeholderTextColor={theme.color.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          blurOnSubmit
          returnKeyType="send"
          onSubmitEditing={() => send(draft)}
          editable={!disabled}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={[styles.sendButton, disabled && styles.sendButtonDisabled]}
          onPress={() => send(draft)}
          disabled={disabled || draft.trim().length === 0}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  quicks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  quickButton: {
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  quickText: {
    color: theme.color.text,
    fontSize: 12,
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.sm,
    padding: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.color.text,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: '#2a1a00',
    fontSize: 14,
    fontWeight: '700',
  },
});
