import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { WaitingParty } from '@/core/party';
import { chat as chatApi } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

const MAX_BODY = 1600;

/**
 * One-off free-text SMS compose dialog. Reuses the /host/queue/:id/chat
 * endpoint (same as quick-reply templates) but with a fresh textarea —
 * hosts use this for situations that don't fit the canned templates.
 */
export function CustomSmsDialog({
  party,
  onClose,
}: {
  party: WaitingParty | null;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locationId = useAuthStore((s) => s.locationId);

  useEffect(() => {
    if (party) {
      setBody('');
      setError(null);
      setSending(false);
    }
  }, [party]);

  if (!party) return null;

  const trimmed = body.trim();
  const canSend = !sending && trimmed.length > 0 && trimmed.length <= MAX_BODY;

  async function handleSend() {
    if (!party) return;
    setSending(true);
    setError(null);
    try {
      if (!locationId) throw new Error('No restaurant selected');
      await chatApi.send(locationId, party.id, trimmed);
      onClose();
      Alert.alert('Sent', 'Your message was sent.');
    } catch (err) {
      setError((err as Error).message || 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Send custom message</Text>
          <View style={styles.toBlock}>
            <Text style={styles.toLabel}>To</Text>
            <Text style={styles.toValue}>{party.name}</Text>
            <Text style={styles.toPhone}>{party.phoneMasked}</Text>
          </View>
          <TextInput
            multiline
            value={body}
            onChangeText={setBody}
            placeholder="Type a one-off message…"
            placeholderTextColor={theme.color.textMuted}
            style={styles.textarea}
            maxLength={MAX_BODY}
            accessibilityLabel="Custom message body"
          />
          <Text style={styles.count}>
            {body.length} / {MAX_BODY}
          </Text>
          {error !== null && <Text style={styles.error}>{error}</Text>}
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSend()}
              disabled={!canSend}
              style={[styles.send, !canSend && styles.sendDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Send custom message"
            >
              <Text style={styles.sendText}>{sending ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: theme.space.lg,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  title: {
    color: theme.color.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: theme.space.md,
  },
  toBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.space.sm,
    marginBottom: theme.space.md,
  },
  toLabel: {
    color: theme.color.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  toValue: { color: theme.color.text, fontSize: 15, fontWeight: '600' },
  toPhone: {
    color: theme.color.textMuted,
    fontSize: 13,
    fontFamily: 'Menlo',
  },
  textarea: {
    minHeight: 110,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    color: theme.color.text,
    backgroundColor: theme.color.surfaceRaised,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  count: {
    color: theme.color.textMuted,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  error: { color: theme.color.warn, fontSize: 13, marginTop: theme.space.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space.sm,
    marginTop: theme.space.md,
  },
  cancel: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
  },
  cancelText: { color: theme.color.textMuted, fontSize: 15, fontWeight: '600' },
  send: {
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
  },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: theme.color.accentFg, fontSize: 15, fontWeight: '700' },
});
