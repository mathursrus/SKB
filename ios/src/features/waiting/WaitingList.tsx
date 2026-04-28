import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { WaitingParty } from '@/core/party';
import { calls } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

import { getChatErrorMessage } from '../chat/chatErrors';
import { SeatDialog } from '../seat-dialog/SeatDialog';
import { AddPartySheet } from './AddPartySheet';
import { PartyRow } from './PartyRow';

export function WaitingList() {
  const locationId = useAuthStore((s) => s.locationId);
  const waiting = useWaitlistStore((s) => s.waiting);
  const seated = useWaitlistStore((s) => s.seated);
  const error = useWaitlistStore((s) => s.error);
  const lastPolledAt = useWaitlistStore((s) => s.lastPolledAt);
  const poll = useWaitlistStore((s) => s.poll);
  const removeParty = useWaitlistStore((s) => s.removeParty);

  const [refreshing, setRefreshing] = useState(false);
  const [seatTarget, setSeatTarget] = useState<WaitingParty | null>(null);
  const [notifying, setNotifying] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await poll();
    setRefreshing(false);
  }

  function handleRemove(party: WaitingParty) {
    Alert.alert(
      `Remove ${party.name}?`,
      'Mark this party as a no-show? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeParty(party.id),
        },
      ],
    );
  }

  async function handleNotify(party: WaitingParty) {
    if (notifying === party.id) return; // prevent double-tap
    setNotifying(party.id);
    try {
      if (!locationId) throw new Error('No restaurant selected');
      const result = await calls.notify(locationId, party.id);
      await poll(); // refresh so the "called" state + re-notify UI reflect
      const action = party.state === 'called' ? 'Re-notified' : 'Notified';
      // Issue #102 #5: SMS may not have gone out if the diner didn't
      // consent — surface that explicitly so the host knows whether the
      // diner actually got an SMS or only the in-app notification.
      const channelNote =
        result.smsStatus === 'sent'
          ? 'SMS sent.'
          : result.smsStatus === 'not_configured'
            ? 'No SMS — they didn’t opt in. They’ll see the notice in their web view.'
            : 'SMS failed to send. They’ll see the notice in their web view.';
      Alert.alert(`${action} ${party.name}`, channelNote);
    } catch (err) {
      Alert.alert('Notify failed', getChatErrorMessage(err));
    } finally {
      setNotifying(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.header}>
          Waiting · <Text style={styles.count}>{waiting.length}</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add walk-in to waitlist"
          style={styles.addButton}
          onPress={() => setAddOpen(true)}
        >
          <Ionicons name="person-add" size={16} color={theme.color.accentFg} />
          <Text style={styles.addButtonText}>Add party</Text>
        </Pressable>
      </View>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={waiting}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PartyRow
            party={item}
            baseAt={lastPolledAt ?? Date.now()}
            onSeat={(party) => setSeatTarget(party)}
            onNotify={(party) => void handleNotify(party)}
            onRemove={handleRemove}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.color.accent}
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>No parties waiting.</Text>}
        removeClippedSubviews
        windowSize={7}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
      />

      <SeatDialog
        party={seatTarget}
        seated={seated}
        onClose={() => setSeatTarget(null)}
      />
      <AddPartySheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
    padding: theme.space.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space.md,
  },
  header: {
    color: theme.color.text,
    fontSize: 20,
    fontWeight: '700',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.color.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
  },
  addButtonText: {
    color: theme.color.accentFg,
    fontSize: 14,
    fontWeight: '700',
  },
  count: { color: theme.color.accent },
  error: { color: theme.color.warn, marginBottom: theme.space.md },
  empty: {
    color: theme.color.textMuted,
    textAlign: 'center',
    marginTop: theme.space.xl,
  },
});
