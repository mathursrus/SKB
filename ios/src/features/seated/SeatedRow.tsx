import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SeatedParty } from '@/core/party';
import { Button } from '@/ui/Button';
import { theme } from '@/ui/theme';

interface Props {
  party: SeatedParty;
  onAdvance: (to: 'ordered' | 'served' | 'checkout' | 'departed') => void;
}

const NEXT_STATE: Record<SeatedParty['state'], 'ordered' | 'served' | 'checkout' | 'departed'> = {
  seated: 'ordered',
  ordered: 'served',
  served: 'checkout',
  checkout: 'departed',
};

const NEXT_LABEL: Record<SeatedParty['state'], string> = {
  seated: 'Ordered',
  ordered: 'Served',
  served: 'Asked for check',
  checkout: 'Departed',
};

function mins(n: number | null): string {
  return typeof n === 'number' ? `${n}m` : '—';
}

function SeatedRowImpl({ party, onAdvance }: Props) {
  const next = NEXT_STATE[party.state];
  const label = NEXT_LABEL[party.state];

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Seated at table ${party.tableNumber ?? '—'}, ${party.name}, ${party.state}, ${party.timeInStateMinutes} minutes in state`}
      style={styles.row}
    >
      <View style={styles.headerLine}>
        <View style={styles.tableBox}>
          <Text style={styles.tableLabel}>TABLE</Text>
          <Text style={styles.tableNumber}>{party.tableNumber ?? '—'}</Text>
        </View>
        <View style={styles.main}>
          <Text style={styles.name} numberOfLines={1}>
            {party.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{party.partySize}</Text>
            <View style={[styles.stateBadge, stateBadgeStyles[party.state]]}>
              <Text style={[styles.stateBadgeText, stateBadgeTextStyles[party.state]]}>
                {party.state.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.meta}>
              {party.timeInStateMinutes}m in state · {party.totalTableMinutes}m at table
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.metricsGrid}>
        <Metric label="Waited" value={mins(party.waitMinutes)} />
        <Metric label="To Order" value={mins(party.toOrderMinutes)} />
        <Metric label="To Serve" value={mins(party.toServeMinutes)} />
        <Metric label="Dining" value={mins(party.toCheckoutMinutes)} />
      </View>
      <View style={styles.actions}>
        <Button
          label={label}
          variant="primary"
          onPress={() => onAdvance(next)}
          accessibilityLabel={`Advance ${party.name} to ${next}`}
        />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export const SeatedRow = memo(SeatedRowImpl, (prev, next) => {
  const a = prev.party;
  const b = next.party;
  return (
    a.id === b.id &&
    a.state === b.state &&
    a.name === b.name &&
    a.partySize === b.partySize &&
    a.tableNumber === b.tableNumber &&
    a.timeInStateMinutes === b.timeInStateMinutes &&
    a.totalTableMinutes === b.totalTableMinutes &&
    a.waitMinutes === b.waitMinutes &&
    a.toOrderMinutes === b.toOrderMinutes &&
    a.toServeMinutes === b.toServeMinutes &&
    a.toCheckoutMinutes === b.toCheckoutMinutes
  );
});

const stateBadgeStyles = StyleSheet.create({
  seated: { backgroundColor: '#1e3a8a' },
  ordered: { backgroundColor: '#854d0e' },
  served: { backgroundColor: '#065f46' },
  checkout: { backgroundColor: '#5b21b6' },
});

const stateBadgeTextStyles = StyleSheet.create({
  seated: { color: '#dbeafe' },
  ordered: { color: '#fef3c7' },
  served: { color: '#d1fae5' },
  checkout: { color: '#ede9fe' },
});

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    gap: theme.space.md,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  tableBox: {
    width: 64,
    padding: theme.space.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceRaised,
    alignItems: 'center',
  },
  tableLabel: { color: theme.color.textMuted, fontSize: 9, letterSpacing: 1 },
  tableNumber: {
    color: theme.color.accent,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  main: { flex: 1 },
  name: { color: theme.color.text, fontSize: 16, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  meta: {
    color: theme.color.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  stateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stateBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  metric: { minWidth: 72 },
  metricValue: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: theme.color.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
