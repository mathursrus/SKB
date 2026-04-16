import { useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { CompletedParty } from '@/core/party';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

import { CompletedRow } from './CompletedRow';

export function CompletedList() {
  const completed = useWaitlistStore((s) => s.completed);
  const summary = useWaitlistStore((s) => s.completedSummary);
  const pollCompleted = useWaitlistStore((s) => s.pollCompleted);

  useEffect(() => {
    void pollCompleted();
  }, [pollCompleted]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Complete · <Text style={styles.count}>{completed.length}</Text>
      </Text>
      <View style={styles.summaryRow}>
        <SummaryChip label="Served" value={String(summary.totalServed)} />
        <SummaryChip label="No-shows" value={String(summary.totalNoShows)} />
        <SummaryChip
          label="Avg Wait"
          value={summary.avgWaitMinutes != null ? `${summary.avgWaitMinutes}m` : '—'}
        />
        <SummaryChip
          label="Avg Table"
          value={summary.avgTableOccupancyMinutes != null ? `${summary.avgTableOccupancyMinutes}m` : '—'}
        />
      </View>
      <FlatList
        data={completed}
        keyExtractor={(p: CompletedParty) => p.id}
        renderItem={({ item }) => <CompletedRow party={item} />}
        ListEmptyComponent={<Text style={styles.empty}>No completed parties yet today.</Text>}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void pollCompleted()}
            tintColor={theme.color.accent}
          />
        }
        removeClippedSubviews
        windowSize={7}
      />
    </View>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
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
  summaryRow: {
    flexDirection: 'row',
    gap: theme.space.sm,
    marginBottom: theme.space.md,
  },
  chip: {
    flex: 1,
    backgroundColor: theme.color.surfaceRaised,
    borderColor: theme.color.line,
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.space.sm,
    alignItems: 'center',
  },
  chipValue: { color: theme.color.text, fontSize: 18, fontWeight: '700' },
  chipLabel: {
    color: theme.color.textMuted,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  empty: {
    color: theme.color.textMuted,
    textAlign: 'center',
    marginTop: theme.space.xl,
  },
});
