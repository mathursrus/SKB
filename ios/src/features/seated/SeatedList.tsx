import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { SeatedParty } from '@/core/party';
import { waitlist as waitlistApi } from '@/net/endpoints';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

import { SeatedRow } from './SeatedRow';

export function SeatedList() {
  const seated = useWaitlistStore((s) => s.seated);
  const poll = useWaitlistStore((s) => s.poll);

  async function handleAdvance(
    party: SeatedParty,
    to: 'ordered' | 'served' | 'checkout' | 'departed',
  ) {
    try {
      await waitlistApi.advance(party.id, to);
      await poll();
    } catch {
      // surfaced via store.error on next poll
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Seated · <Text style={styles.count}>{seated.length}</Text>
      </Text>
      <FlatList
        data={seated}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <SeatedRow party={item} onAdvance={(to) => void handleAdvance(item, to)} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No parties seated.</Text>}
        removeClippedSubviews
        windowSize={7}
      />
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
  count: {
    color: theme.color.accent,
  },
  empty: {
    color: theme.color.textMuted,
    textAlign: 'center',
    marginTop: theme.space.xl,
  },
});
