import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { config as configApi, stats as statsApi, type HostStats } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

export default function WorkspaceScreen() {
  const role = useAuthStore((s) => s.role);
  const locationId = useAuthStore((s) => s.locationId);
  const brand = useAuthStore((s) => s.brand);

  const [stats, setStats] = useState<HostStats | null>(null);
  const [guestFeatures, setGuestFeatures] = useState({ sms: true, chat: true, order: true });
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [frontDeskPhone, setFrontDeskPhone] = useState('');
  const [voiceThreshold, setVoiceThreshold] = useState('10');
  const [smsSenderName, setSmsSenderName] = useState('');
  const [publicHost, setPublicHost] = useState('');
  const [heroHeadline, setHeroHeadline] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!locationId) return;
      try {
        const [nextStats, nextFeatures, nextVoice, nextMessaging, nextSite, nextWebsite] = await Promise.all([
          statsApi.getStats(locationId),
          configApi.guestFeatures(locationId),
          configApi.voiceConfig(locationId),
          configApi.messagingConfig(locationId),
          configApi.siteConfig(locationId),
          configApi.websiteConfig(locationId),
        ]);
        setStats(nextStats);
        setGuestFeatures(nextFeatures);
        setVoiceEnabled(nextVoice.voiceEnabled);
        setFrontDeskPhone(nextVoice.frontDeskPhone);
        setVoiceThreshold(String(nextVoice.voiceLargePartyThreshold));
        setSmsSenderName(nextMessaging.smsSenderName);
        setPublicHost(nextSite.publicHost);
        setHeroHeadline(nextWebsite.content?.heroHeadline ?? '');
      } catch (err) {
        setError((err as Error).message || 'Failed to load workspace');
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId]);

  async function saveGuestExperience() {
    if (!locationId) return;
    setSaving('guest');
    setError(null);
    try {
      const next = await configApi.saveGuestFeatures(locationId, guestFeatures);
      setGuestFeatures(next);
      Alert.alert('Saved', 'Guest experience settings updated.');
    } catch (err) {
      setError((err as Error).message || 'Failed to save guest settings');
    } finally {
      setSaving(null);
    }
  }

  async function saveFrontDesk() {
    if (!locationId) return;
    setSaving('frontdesk');
    setError(null);
    try {
      const next = await configApi.saveVoiceConfig(locationId, {
        voiceEnabled,
        frontDeskPhone,
        voiceLargePartyThreshold: parseInt(voiceThreshold, 10) || 10,
      });
      setVoiceEnabled(next.voiceEnabled);
      setFrontDeskPhone(next.frontDeskPhone);
      setVoiceThreshold(String(next.voiceLargePartyThreshold));
      Alert.alert('Saved', 'Front desk settings updated.');
    } catch (err) {
      setError((err as Error).message || 'Failed to save front desk settings');
    } finally {
      setSaving(null);
    }
  }

  async function saveMessaging() {
    if (!locationId) return;
    setSaving('messaging');
    setError(null);
    try {
      const next = await configApi.saveMessagingConfig(locationId, { smsSenderName });
      setSmsSenderName(next.smsSenderName);
      Alert.alert('Saved', 'Messaging branding updated.');
    } catch (err) {
      setError((err as Error).message || 'Failed to save messaging branding');
    } finally {
      setSaving(null);
    }
  }

  if (role !== 'owner' && role !== 'admin') {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Workspace is admin-only</Text>
        <Text style={styles.emptyBody}>Hosts still have access to Waiting, Seated, Complete, and Settings.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>OSH workspace</Text>
        <Text style={styles.heroTitle}>{brand?.restaurantName ?? 'Restaurant'}</Text>
        <Text style={styles.heroSubtitle}>
          Website, guest, and front-desk controls now live in the app for admins. Hosts stay focused on floor execution.
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
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Guest experience</Text>
        <SettingRow label="SMS updates" value={guestFeatures.sms} onChange={(value) => setGuestFeatures((s) => ({ ...s, sms: value }))} />
        <SettingRow label="Guest chat" value={guestFeatures.chat} onChange={(value) => setGuestFeatures((s) => ({ ...s, chat: value }))} />
        <SettingRow label="Guest ordering" value={guestFeatures.order} onChange={(value) => setGuestFeatures((s) => ({ ...s, order: value }))} />
        <PrimaryButton
          label={saving === 'guest' ? 'Saving...' : 'Save guest experience'}
          disabled={saving !== null}
          onPress={() => void saveGuestExperience()}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Messaging brand</Text>
        <Text style={styles.hint}>Every shared-number SMS starts with this restaurant name.</Text>
        <TextInput
          value={smsSenderName}
          onChangeText={setSmsSenderName}
          placeholder="Shri Krishna Bhavan"
          placeholderTextColor={theme.color.textMuted}
          style={styles.input}
        />
        <PrimaryButton
          label={saving === 'messaging' ? 'Saving...' : 'Save messaging name'}
          disabled={saving !== null}
          onPress={() => void saveMessaging()}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Front desk</Text>
        <SettingRow label="Voice flow enabled" value={voiceEnabled} onChange={setVoiceEnabled} />
        <Text style={styles.fieldLabel}>Front desk phone</Text>
        <TextInput
          value={frontDeskPhone}
          onChangeText={setFrontDeskPhone}
          placeholder="2065551234"
          placeholderTextColor={theme.color.textMuted}
          style={styles.input}
          keyboardType="phone-pad"
        />
        <Text style={styles.fieldLabel}>Large party threshold</Text>
        <TextInput
          value={voiceThreshold}
          onChangeText={(value) => setVoiceThreshold(value.replace(/[^\d]/g, ''))}
          placeholder="10"
          placeholderTextColor={theme.color.textMuted}
          style={[styles.input, styles.narrowInput]}
          keyboardType="number-pad"
        />
        <PrimaryButton
          label={saving === 'frontdesk' ? 'Saving...' : 'Save front desk settings'}
          disabled={saving !== null}
          onPress={() => void saveFrontDesk()}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Brand summary</Text>
        <SummaryRow label="Template" value={brand?.websiteTemplate ?? 'saffron'} />
        <SummaryRow label="Public host" value={publicHost || 'Not configured'} />
        <SummaryRow label="Hero headline" value={heroHeadline || 'Using template default'} />
      </View>
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
    <View style={styles.metric}>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{loading ? '...' : value ?? '-'}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SettingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.color.accent, false: theme.color.line }} />
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)}m`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  content: {
    padding: theme.space.lg,
    gap: theme.space.lg,
    paddingBottom: theme.space.xxl,
  },
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
  heroTitle: {
    color: theme.color.text,
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  heroSubtitle: {
    color: theme.color.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  error: {
    color: theme.color.warn,
    fontWeight: '600',
  },
  card: {
    borderRadius: 22,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.lg,
    gap: theme.space.md,
  },
  cardTitle: {
    color: theme.color.text,
    fontSize: 18,
    fontWeight: '800',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  metric: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.md,
    backgroundColor: theme.color.surface,
  },
  metricValue: {
    color: theme.color.text,
    fontSize: 24,
    fontWeight: '800',
  },
  metricValueAccent: {
    color: theme.color.accent,
  },
  metricLabel: {
    color: theme.color.textMuted,
    marginTop: 4,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    color: theme.color.text,
    fontWeight: '600',
    fontSize: 15,
  },
  hint: {
    color: theme.color.textMuted,
    fontSize: 13,
  },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  input: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    color: theme.color.text,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    fontSize: 15,
  },
  narrowInput: {
    width: 88,
  },
  primaryButton: {
    marginTop: theme.space.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    paddingVertical: theme.space.md,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: theme.color.accentFg,
    fontWeight: '800',
    fontSize: 15,
  },
  summaryRow: {
    gap: 4,
  },
  summaryLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  summaryValue: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.xl,
  },
  emptyTitle: {
    color: theme.color.text,
    fontSize: 22,
    fontWeight: '800',
  },
  emptyBody: {
    color: theme.color.textMuted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
});
