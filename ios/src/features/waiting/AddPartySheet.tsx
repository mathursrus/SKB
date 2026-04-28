import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { waitlist as waitlistApi } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

/**
 * Host-initiated add-party dialog for walk-ins. Posts to POST
 * /host/queue/add which reuses the join service without rate limiting
 * or an auto-confirmation SMS (the host is face-to-face with the party).
 */
export function AddPartySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const poll = useWaitlistStore((s) => s.poll);
  const locationId = useAuthStore((s) => s.locationId);
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
    // Phone is OPTIONAL for walk-ins — matches the website. If the host
    // typed any digits the count must be exactly 10 (US format); empty
    // is fine and the server accepts the walk-in without a phone.
    if (cleanedPhone.length > 0 && cleanedPhone.length !== 10) {
      setError('Phone must be exactly 10 digits, or leave it blank');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (!locationId) throw new Error('No restaurant selected');
      const r = await waitlistApi.addParty(locationId, { name: trimmedName, partySize: sz, phone: cleanedPhone });
      await poll();
      onClose();
      Alert.alert('Added to waitlist', `${trimmedName} · code ${r.code} · #${r.position}`);
    } catch (err) {
      setError((err as Error).message || 'Failed to add party');
    } finally {
      setSubmitting(false);
    }
  }

  const phoneDigits = phone.replace(/[^\d]/g, '').length;
  const canSubmit = !submitting
    && name.trim().length > 0
    && size.length > 0
    && (phoneDigits === 0 || phoneDigits === 10);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardAvoidingView wraps the whole modal so the sheet slides up
          when the keyboard appears — without this the submit button sits
          behind the keyboard on iPhone and the form can't be completed. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.title}>Add party</Text>
              <Pressable
                onPress={onClose}
                accessibilityLabel="Close"
                hitSlop={12}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={22} color={theme.color.text} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
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
                returnKeyType="next"
              />

              <Text style={styles.label}>Party size</Text>
              <TextInput
                value={size}
                onChangeText={(v) => setSize(v.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                style={[styles.input, styles.narrow]}
                maxLength={2}
                accessibilityLabel="Party size"
                returnKeyType="next"
              />

              <Text style={styles.label}>Phone (optional)</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="2065551234"
                placeholderTextColor={theme.color.textMuted}
                style={styles.input}
                maxLength={14}
                accessibilityLabel="Phone number, optional"
                returnKeyType="done"
                onSubmitEditing={() => { if (canSubmit) void handleSubmit(); }}
              />
              <Text style={styles.hint}>
                10 digits — we'll text the status code. Leave blank for walk-ins without a phone.
              </Text>

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
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    maxHeight: '90%',
  },
  scrollContent: {
    paddingBottom: theme.space.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.md,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
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
