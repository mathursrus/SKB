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
  seated: 'Mark ordered',
  ordered: 'Mark served',
  served: 'Mark checkout',
  checkout: 'Close out',
};

function SeatedRowImpl({ party, onAdvance }: Props) {
  const next = NEXT_STATE[party.state];
  const label = NEXT_LABEL[party.state];

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Seated at table ${party.tableNumber ?? '—'}, ${party.name}`}
      style={styles.row}
    >
      <View style={styles.tableBox}>
        <Text style={styles.tableLabel}>TABLE</Text>
        <Text style={styles.tableNumber}>{party.tableNumber ?? '—'}</Text>
      </View>
      <View style={styles.main}>
        <Text style={styles.name}>{party.name}</Text>
        <Text style={styles.meta}>
          {party.partySize} · {party.state} · {party.timeInStateMinutes}m in state
        </Text>
      </View>
      <View style={styles.actions}>
        <Button label={label} onPress={() => onAdvance(next)} />
      </View>
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
    a.timeInStateMinutes === b.timeInStateMinutes
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    gap: theme.space.md,
  },
  tableBox: {
    width: 72,
    padding: theme.space.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceRaised,
    alignItems: 'center',
  },
  tableLabel: {
    color: theme.color.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  tableNumber: {
    color: theme.color.accent,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  main: {
    flex: 1,
  },
  name: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: theme.color.textMuted,
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
  },
});
