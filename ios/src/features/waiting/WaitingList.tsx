import { useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { WaitingParty } from '@/core/party';
import { calls } from '@/net/endpoints';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

import { SeatDialog } from '../seat-dialog/SeatDialog';
import { CustomCallDialog } from './CustomCallDialog';
import { CustomSmsDialog } from './CustomSmsDialog';
import { PartyRow } from './PartyRow';

export function WaitingList() {
  const waiting = useWaitlistStore((s) => s.waiting);
  const seated = useWaitlistStore((s) => s.seated);
  const error = useWaitlistStore((s) => s.error);
  const lastPolledAt = useWaitlistStore((s) => s.lastPolledAt);
  const poll = useWaitlistStore((s) => s.poll);
  const removeParty = useWaitlistStore((s) => s.removeParty);

  const [refreshing, setRefreshing] = useState(false);
  const [seatTarget, setSeatTarget] = useState<WaitingParty | null>(null);
  const [smsTarget, setSmsTarget] = useState<WaitingParty | null>(null);
  const [callTarget, setCallTarget] = useState<WaitingParty | null>(null);
  const [notifying, setNotifying] = useState<string | null>(null);

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
      await calls.customCall(party.id);
      await poll(); // refresh so the "called" state + re-notify UI reflect
      const action = party.state === 'called' ? 'Re-notified' : 'Notified';
      Alert.alert('SMS sent', `${action} ${party.name}.`);
    } catch (err) {
      Alert.alert('Notify failed', (err as Error).message || 'Could not send SMS.');
    } finally {
      setNotifying(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Waiting · <Text style={styles.count}>{waiting.length}</Text>
      </Text>
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
            onCustomSms={(party) => setSmsTarget(party)}
            onCustomCall={(party) => setCallTarget(party)}
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
      <CustomSmsDialog party={smsTarget} onClose={() => setSmsTarget(null)} />
      <CustomCallDialog party={callTarget} onClose={() => setCallTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
    padding: theme.space.lg,
  },
  header: {
    color: theme.color.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: theme.space.md,
  },
  count: { color: theme.color.accent },
  error: { color: theme.color.warn, marginBottom: theme.space.md },
  empty: {
    color: theme.color.textMuted,
    textAlign: 'center',
    marginTop: theme.space.xl,
  },
});
