import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { events, logger } from '@/core/logger';
import type { WaitingParty } from '@/core/party';
import { calls } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

/**
 * Confirm-before-dial modal. The host stand is often a shared device — an
 * accidental tap on the bare Call button shouldn't auto-open the dialer.
 * This dialog gates the action behind an explicit confirmation and also
 * shows who will be called + which number.
 */
export function CustomCallDialog({
  party,
  onClose,
}: {
  party: WaitingParty | null;
  onClose: () => void;
}) {
  const locationId = useAuthStore((s) => s.locationId);
  if (!party) return null;

  function handleCall() {
    if (!party?.phoneForDial) {
      Alert.alert('No phone on file');
      return;
    }
    logger.info(events.callInitiate, { partyId: party.id });
    if (locationId) void calls.log(locationId, party.id).catch(() => {});
    const cleaned = party.phoneForDial.replace(/[^\d+]/g, '');
    void Linking.openURL(`tel:${cleaned}`);
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Confirm call</Text>
          <Text style={styles.body}>
            Call <Text style={styles.name}>{party.name}</Text>
          </Text>
          <Text style={styles.phone}>{party.phoneMasked}</Text>
          <Text style={styles.hint}>
            This will open your device dialer. The party will see your restaurant
            number (or your personal number if the host stand is a personal phone).
          </Text>
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleCall}
              style={styles.confirm}
              accessibilityRole="button"
              accessibilityLabel={`Call ${party.name} now`}
            >
              <Text style={styles.confirmText}>Call now</Text>
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
  body: { color: theme.color.text, fontSize: 15 },
  name: { color: theme.color.text, fontWeight: '700' },
  phone: {
    color: theme.color.accent,
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Menlo',
    marginVertical: theme.space.sm,
  },
  hint: {
    color: theme.color.textMuted,
    fontSize: 13,
    marginTop: theme.space.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space.sm,
    marginTop: theme.space.lg,
  },
  cancel: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
  },
  cancelText: { color: theme.color.textMuted, fontSize: 15, fontWeight: '600' },
  confirm: {
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
  },
  confirmText: { color: theme.color.accentFg, fontSize: 15, fontWeight: '700' },
});
