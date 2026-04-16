import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { waitlist as waitlistApi } from '@/net/endpoints';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

/**
 * Host-initiated add-party dialog for walk-ins. Posts to POST
 * /host/queue/add which reuses the join service without rate limiting
 * or an auto-confirmation SMS (the host is face-to-face with the party).
 */
export function AddPartySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const poll = useWaitlistStore((s) => s.poll);
  const [name, setName] = useState('');
  const [size, setSize] = useState('2');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setSize('2');
      setPhone('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    const sz = parseInt(size, 10);
    const cleanedPhone = phone.replace(/[^\d]/g, '');
    if (trimmedName.length < 1 || trimmedName.length > 60) {
      setError('Name must be 1–60 characters');
      return;
    }
    if (!Number.isFinite(sz) || sz < 1 || sz > 10) {
      setError('Party size must be 1–10');
      return;
    }
    if (cleanedPhone.length !== 10) {
      setError('Phone must be exactly 10 digits');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await waitlistApi.addParty({ name: trimmedName, partySize: sz, phone: cleanedPhone });
      await poll();
      onClose();
      Alert.alert('Added to waitlist', `${trimmedName} · code ${r.code} · #${r.position}`);
    } catch (err) {
      setError((err as Error).message || 'Failed to add party');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !submitting && name.trim().length > 0 && size.length > 0 && phone.replace(/[^\d]/g, '').length === 10;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Add party</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.color.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Party name"
            placeholderTextColor={theme.color.textMuted}
            style={styles.input}
            maxLength={60}
            autoCapitalize="words"
            accessibilityLabel="Party name"
            autoFocus
          />

          <Text style={styles.label}>Party size</Text>
          <TextInput
            value={size}
            onChangeText={(v) => setSize(v.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            style={[styles.input, styles.narrow]}
            maxLength={2}
            accessibilityLabel="Party size"
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="2065551234"
            placeholderTextColor={theme.color.textMuted}
            style={styles.input}
            maxLength={14}
            accessibilityLabel="Phone number"
          />
          <Text style={styles.hint}>10 digits. We'll text the status code to this number.</Text>

          {error !== null && <Text style={styles.error}>{error}</Text>}

          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Add to waitlist"
            >
              <Text style={styles.submitText}>{submitting ? 'Adding…' : 'Add to waitlist'}</Text>
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
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: theme.space.lg,
    paddingBottom: theme.space.xxl,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.lg,
  },
  title: { color: theme.color.text, fontSize: 20, fontWeight: '700' },
  label: {
    color: theme.color.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.space.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    color: theme.color.text,
    backgroundColor: theme.color.surfaceRaised,
    fontSize: 16,
  },
  narrow: { width: 96 },
  hint: { color: theme.color.textMuted, fontSize: 12, marginTop: 4 },
  error: { color: theme.color.warn, fontSize: 13, marginTop: theme.space.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space.sm,
    marginTop: theme.space.xl,
  },
  cancel: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
  },
  cancelText: { color: theme.color.textMuted, fontSize: 15, fontWeight: '600' },
  submit: {
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: theme.color.accentFg, fontSize: 15, fontWeight: '700' },
});
