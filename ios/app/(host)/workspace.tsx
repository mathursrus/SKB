import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CallerInsights } from '@/features/admin';
import { stats as statsApi, type HostStats } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

export default function WorkspaceScreen() {
  const role = useAuthStore((s) => s.role);
  const locationId = useAuthStore((s) => s.locationId);
  const brand = useAuthStore((s) => s.brand);

  const [stats, setStats] = useState<HostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!locationId) return;
    setLoading(true);
    statsApi
      .getStats(locationId)
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load workspace');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  if (role !== 'owner' && role !== 'admin') {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Workspace is admin-only</Text>
        <Text style={styles.emptyBody}>Hosts have access to Waiting, Seated, Complete, and Settings.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Operations dashboard</Text>
        <Text style={styles.heroTitle}>{brand?.restaurantName ?? 'Restaurant'}</Text>
        <Text style={styles.heroSubtitle}>
          Today&apos;s floor and queue snapshot, plus phone-channel performance. All configuration lives in the
          Settings tab.
        </Text>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ops snapshot</Text>
        <View style={styles.metrics}>
          <Metric label="Joined today" value={stats?.totalJoined} loading={loading} />
          <Metric label="Still waiting" value={stats?.stillWaiting} loading={loading} accent />
          <Metric label="Seated" value={stats?.partiesSeated} loading={loading} />
          <Metric label="No-shows" value={stats?.noShows} loading={loading} />
          <Metric label="Avg wait" value={formatMinutes(stats?.avgActualWaitMinutes)} loading={loading} />
          <Metric label="Peak hour" value={stats?.peakHourLabel ?? '-'} loading={loading} />
          <Metric label="Avg order" value={formatMinutes(stats?.avgOrderTimeMinutes)} loading={loading} />
          <Metric label="Avg serve" value={formatMinutes(stats?.avgServeTimeMinutes)} loading={loading} />
          <Metric label="Avg checkout" value={formatMinutes(stats?.avgCheckoutTimeMinutes)} loading={loading} />
          <Metric label="Avg occupancy" value={formatMinutes(stats?.avgTableOccupancyMinutes)} loading={loading} />
        </View>
      </View>

      {locationId && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phone channel</Text>
          <CallerInsights locationId={locationId} />
        </View>
      )}
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: string | number | null | undefined;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${label}: ${loading ? 'loading' : value ?? 'n/a'}`}>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{loading ? '…' : value ?? '-'}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)}m`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  content: { padding: theme.space.lg, gap: theme.space.lg, paddingBottom: theme.space.xxl },
  hero: {
    borderRadius: 28,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.xl,
  },
  eyebrow: {
    color: theme.color.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    fontSize: 12,
  },
  heroTitle: { color: theme.color.text, fontSize: 30, fontWeight: '800', marginTop: 8 },
  heroSubtitle: { color: theme.color.textMuted, fontSize: 14, lineHeight: 20, marginTop: 10 },
  error: { color: theme.color.warn, fontWeight: '600' },
  card: {
    borderRadius: 22,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.lg,
    gap: theme.space.md,
  },
  cardTitle: { color: theme.color.text, fontSize: 18, fontWeight: '800' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md },
  metric: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.md,
    backgroundColor: theme.color.surface,
    minHeight: 72,
  },
  metricValue: { color: theme.color.text, fontSize: 24, fontWeight: '800' },
  metricValueAccent: { color: theme.color.accent },
  metricLabel: { color: theme.color.textMuted, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.space.xl },
  emptyTitle: { color: theme.color.text, fontSize: 22, fontWeight: '800' },
  emptyBody: { color: theme.color.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 20 },
});
