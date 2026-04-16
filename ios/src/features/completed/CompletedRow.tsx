import { StyleSheet, Text, View } from 'react-native';

import type { CompletedParty } from '@/core/party';
import { theme } from '@/ui/theme';

export function CompletedRow({ party }: { party: CompletedParty }) {
  const isNoShow = party.state === 'no_show';
  return (
    <View style={[styles.row, isNoShow && styles.rowNoShow]}>
      <View style={styles.headerLine}>
        <Text style={styles.name} numberOfLines={1}>
          {party.name}
        </Text>
        <Text style={styles.size}>· {party.partySize}</Text>
        <View style={[styles.badge, isNoShow ? styles.badgeNoShow : styles.badgeDeparted]}>
          <Text style={[styles.badgeText, isNoShow ? styles.badgeTextNoShow : styles.badgeTextDeparted]}>
            {isNoShow ? 'NO-SHOW' : 'DEPARTED'}
          </Text>
        </View>
      </View>
      <View style={styles.metricsGrid}>
        <Metric label="Waited" value={mins(party.waitTimeMinutes)} />
        <Metric label="To Order" value={mins(party.toOrderMinutes)} />
        <Metric label="To Serve" value={mins(party.toServeMinutes)} />
        <Metric label="Dining" value={mins(party.toCheckoutMinutes)} />
        <Metric label="Paying" value={mins(party.toDepartMinutes)} />
        <Metric label="Total" value={mins(party.totalTimeMinutes)} emphasized />
      </View>
    </View>
  );
}

function Metric({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, emphasized && styles.metricValueEmphasized]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function mins(n: number | null): string {
  return typeof n === 'number' ? `${n}m` : '—';
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.color.surfaceRaised,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    marginBottom: theme.space.sm,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  rowNoShow: {
    borderColor: theme.color.warn,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.space.sm,
    gap: theme.space.xs,
  },
  name: {
    color: theme.color.text,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  size: {
    color: theme.color.textMuted,
    fontSize: 14,
  },
  badge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeDeparted: { backgroundColor: theme.color.line },
  badgeNoShow: { backgroundColor: theme.color.warn },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  badgeTextDeparted: { color: theme.color.text },
  badgeTextNoShow: { color: theme.color.surface },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
  metric: {
    minWidth: 72,
    paddingVertical: 2,
  },
  metricValue: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricValueEmphasized: {
    color: theme.color.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    color: theme.color.textMuted,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
