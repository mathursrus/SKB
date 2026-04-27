import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { callerStats as callerStatsApi, type CallerOutcome, type CallerStatsResponse } from '@/net/endpoints';
import { theme } from '@/ui/theme';

import { CALLER_OUTCOME_META, OUTCOME_TYPE_COLOR } from './callerOutcomeMeta';

type Range = '1' | '7' | '30';

const RANGE_OPTIONS: ReadonlyArray<{ key: Range; label: string }> = [
  { key: '1', label: 'Today' },
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
];

const FUNNEL_STEPS: ReadonlyArray<{ key: keyof CallerStatsResponse['funnel']; label: string; help: string }> = [
  { key: 'inboundCalls', label: 'Inbound calls', help: 'Total calls reaching the IVR.' },
  { key: 'joinIntent', label: 'Join intent', help: 'Caller chose to join the waitlist.' },
  { key: 'reachedPhoneConfirmation', label: 'Phone confirmed', help: 'Reached the last hurdle before joining.' },
  { key: 'joinedWaitlist', label: 'Joined waitlist', help: 'Successful conversion.' },
];

export function CallerInsights({ locationId }: { locationId: string }) {
  const [range, setRange] = useState<Range>('7');
  const [data, setData] = useState<CallerStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<CallerOutcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    callerStatsApi
      .get(locationId, range)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        // Auto-select the largest non-conversion outcome to give immediate signal
        if (next.outcomes.length > 0 && !selectedOutcome) {
          const sorted = [...next.outcomes].sort((a, b) => b.count - a.count);
          const top = sorted[0];
          if (top) setSelectedOutcome(top.key);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load caller stats');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // selectedOutcome intentionally excluded — we only auto-pick on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, range]);

  const inbound = data?.funnel.inboundCalls ?? 0;
  const selectedMeta = selectedOutcome ? CALLER_OUTCOME_META[selectedOutcome] : null;
  const selectedStat = useMemo(
    () => data?.outcomes.find((o) => o.key === selectedOutcome),
    [data, selectedOutcome],
  );

  return (
    <View style={styles.wrap}>
      {/* Range selector */}
      <View style={styles.rangeRow} accessibilityRole="tablist">
        {RANGE_OPTIONS.map(({ key, label }) => {
          const active = range === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={() => setRange(key)}
              hitSlop={6}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
            >
              <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {/* Funnel */}
      <View style={styles.funnelBlock}>
        <Text style={styles.sectionLabel}>Caller funnel</Text>
        {FUNNEL_STEPS.map(({ key, label, help }) => {
          const value = data?.funnel[key] ?? 0;
          const widthPct = inbound > 0 ? Math.max(2, Math.round((value / inbound) * 100)) : 2;
          const sharePct = inbound > 0 ? Math.round((value / inbound) * 100) : null;
          return (
            <View key={key} style={styles.funnelRow}>
              <View style={styles.funnelHeader}>
                <Text style={styles.funnelLabel}>{label}</Text>
                <Text style={styles.funnelValue}>
                  {loading ? '...' : value}
                  {sharePct !== null && key !== 'inboundCalls' && (
                    <Text style={styles.funnelShare}> · {sharePct}%</Text>
                  )}
                </Text>
              </View>
              <View style={styles.funnelTrack} accessibilityElementsHidden>
                <View style={[styles.funnelFill, { width: `${widthPct}%` }]} />
              </View>
              <Text style={styles.funnelHelp}>{help}</Text>
            </View>
          );
        })}
      </View>

      {/* Outcomes */}
      <View>
        <Text style={styles.sectionLabel}>Outcomes</Text>
        <View style={styles.chips}>
          {data?.outcomes.map((o) => {
            const meta = CALLER_OUTCOME_META[o.key];
            if (!meta) return null;
            const active = selectedOutcome === o.key;
            const colorKey = OUTCOME_TYPE_COLOR[meta.type];
            return (
              <Pressable
                key={o.key}
                accessibilityRole="button"
                accessibilityLabel={`${meta.label}: ${o.count} calls`}
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedOutcome(o.key)}
                hitSlop={4}
                style={[
                  styles.chip,
                  { borderColor: theme.color[colorKey] },
                  active && { backgroundColor: theme.color[colorKey] },
                ]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {meta.label}
                </Text>
                <Text style={[styles.chipCount, active && styles.chipLabelActive]}>{o.count}</Text>
              </Pressable>
            );
          })}
          {!loading && data?.outcomes.length === 0 && (
            <Text style={styles.muted}>No caller activity in this range.</Text>
          )}
        </View>

        {selectedMeta && selectedStat && (
          <View style={styles.detailCard} accessibilityLiveRegion="polite">
            <Text style={styles.detailType}>{selectedMeta.type}</Text>
            <Text style={styles.detailLabel}>{selectedMeta.label}</Text>
            <Text style={styles.detailCount}>
              {selectedStat.count} {selectedStat.count === 1 ? 'call' : 'calls'} ·{' '}
              {Math.round(selectedStat.share * 100)}%
            </Text>
            <Text style={styles.detailCopy}>{selectedMeta.copy}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space.lg },
  rangeRow: { flexDirection: 'row', gap: theme.space.sm },
  rangeChip: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    minHeight: 36,
    justifyContent: 'center',
  },
  rangeChipActive: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  rangeChipText: { color: theme.color.text, fontSize: 13, fontWeight: '700' },
  rangeChipTextActive: { color: theme.color.accentFg },
  error: { color: theme.color.warn, fontWeight: '600' },
  sectionLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
    marginBottom: theme.space.sm,
  },
  funnelBlock: { gap: theme.space.md },
  funnelRow: { gap: 4 },
  funnelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  funnelLabel: { color: theme.color.text, fontSize: 14, fontWeight: '600' },
  funnelValue: {
    color: theme.color.text,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  funnelShare: { color: theme.color.textMuted, fontSize: 12, fontWeight: '600' },
  funnelTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.surface,
    overflow: 'hidden',
  },
  funnelFill: {
    height: '100%',
    backgroundColor: theme.color.accent,
    borderRadius: 4,
  },
  funnelHelp: { color: theme.color.textMuted, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: theme.color.surface,
    minHeight: 32,
  },
  chipLabel: { color: theme.color.text, fontSize: 13, fontWeight: '600' },
  chipLabelActive: { color: theme.color.accentFg },
  chipCount: {
    color: theme.color.textMuted,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  detailCard: {
    marginTop: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: 4,
  },
  detailType: {
    color: theme.color.accent,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  detailLabel: { color: theme.color.text, fontSize: 16, fontWeight: '800' },
  detailCount: { color: theme.color.textMuted, fontSize: 13, fontWeight: '600' },
  detailCopy: { color: theme.color.text, fontSize: 13, lineHeight: 19, marginTop: 4 },
  muted: { color: theme.color.textMuted, fontSize: 13 },
});
