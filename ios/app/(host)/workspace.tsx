import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  config as configApi,
  stats as statsApi,
  type DayHours,
  type DayOfWeek,
  type HostStats,
  type LocationAddress,
  type ServiceWindowKey,
  type WeeklyHours,
} from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

const DAYS: ReadonlyArray<{ key: DayOfWeek; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const SERVICE_WINDOWS: ReadonlyArray<{ key: ServiceWindowKey; label: string }> = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'special', label: 'Special' },
  { key: 'dinner', label: 'Dinner' },
];

const EMPTY_ADDRESS: LocationAddress = { street: '', city: '', state: '', zip: '' };

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
  const [hours, setHours] = useState<WeeklyHours>({});
  const [address, setAddress] = useState<LocationAddress>(EMPTY_ADDRESS);
  const [restaurantName, setRestaurantName] = useState('');
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
        setHours(nextSite.hours ?? {});
        setAddress(nextSite.address ?? EMPTY_ADDRESS);
        setRestaurantName(nextSite.name);
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

  async function saveHours() {
    if (!locationId) return;
    setSaving('hours');
    setError(null);
    try {
      const next = await configApi.saveSiteConfig(locationId, { hours });
      setHours(next.hours ?? {});
      Alert.alert('Saved', 'Hours updated.');
    } catch (err) {
      setError((err as Error).message || 'Failed to save hours');
    } finally {
      setSaving(null);
    }
  }

  async function saveLocation() {
    if (!locationId) return;
    const trimmedHost = publicHost.trim();
    setSaving('location');
    setError(null);
    try {
      const next = await configApi.saveSiteConfig(locationId, {
        address: hasAddress(address) ? address : null,
        publicHost: trimmedHost ? trimmedHost : null,
      });
      setAddress(next.address ?? EMPTY_ADDRESS);
      setPublicHost(next.publicHost);
      Alert.alert('Saved', 'Address and public host updated.');
    } catch (err) {
      setError((err as Error).message || 'Failed to save location');
    } finally {
      setSaving(null);
    }
  }

  function setDayClosed(day: DayOfWeek, closed: boolean) {
    setHours((prev) => {
      const next: WeeklyHours = { ...prev };
      next[day] = closed ? 'closed' : { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } };
      return next;
    });
  }

  function setWindowTime(day: DayOfWeek, service: ServiceWindowKey, edge: 'open' | 'close', value: string) {
    setHours((prev) => {
      const entry = prev[day];
      const dayHours: DayHours = entry === 'closed' || !entry ? {} : { ...entry };
      const window = dayHours[service] ?? { open: '', close: '' };
      dayHours[service] = { ...window, [edge]: value };
      return { ...prev, [day]: dayHours };
    });
  }

  function toggleWindow(day: DayOfWeek, service: ServiceWindowKey, enabled: boolean) {
    setHours((prev) => {
      const entry = prev[day];
      const dayHours: DayHours = entry === 'closed' || !entry ? {} : { ...entry };
      if (enabled) {
        const defaults: Record<ServiceWindowKey, { open: string; close: string }> = {
          breakfast: { open: '08:00', close: '10:30' },
          lunch: { open: '11:30', close: '14:30' },
          special: { open: '15:00', close: '17:00' },
          dinner: { open: '17:30', close: '21:30' },
        };
        dayHours[service] = defaults[service];
      } else {
        delete dayHours[service];
      }
      return { ...prev, [day]: dayHours };
    });
  }

  function copyDayToAll(sourceDay: DayOfWeek) {
    setHours((prev) => {
      const source = prev[sourceDay];
      const next: WeeklyHours = {};
      for (const { key } of DAYS) {
        next[key] = source === 'closed' ? 'closed' : source ? { ...source } : 'closed';
      }
      return next;
    });
    Alert.alert('Copied', `${dayLabel(sourceDay)} hours copied to all days.`);
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
        <Text style={styles.cardTitle}>Hours of operation</Text>
        <Text style={styles.hint}>
          Per-day windows shown to guests, used by the IVR, and shown on the website. Times are 24-hour HH:MM.
        </Text>
        {DAYS.map(({ key, label }) => (
          <DayHoursRow
            key={key}
            day={key}
            label={label}
            entry={hours[key]}
            onSetClosed={(closed) => setDayClosed(key, closed)}
            onToggleWindow={(service, enabled) => toggleWindow(key, service, enabled)}
            onSetTime={(service, edge, value) => setWindowTime(key, service, edge, value)}
            onCopyToAll={() => copyDayToAll(key)}
          />
        ))}
        <PrimaryButton
          label={saving === 'hours' ? 'Saving...' : 'Save hours'}
          disabled={saving !== null || loading}
          onPress={() => void saveHours()}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location & web</Text>
        <Text style={styles.hint}>
          Address powers maps embeds and the IVR location prompt. Public host is your dinerfacing slug
          (e.g. `skbbellevue` → skbbellevue.com).
        </Text>
        <SummaryRow label="Restaurant" value={restaurantName || locationId || '—'} />
        <Text style={styles.fieldLabel}>Street</Text>
        <TextInput
          value={address.street}
          onChangeText={(v) => setAddress((a) => ({ ...a, street: v }))}
          placeholder="12 Bellevue Way SE"
          placeholderTextColor={theme.color.textMuted}
          style={styles.input}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.fieldLabel}>City</Text>
            <TextInput
              value={address.city}
              onChangeText={(v) => setAddress((a) => ({ ...a, city: v }))}
              placeholder="Bellevue"
              placeholderTextColor={theme.color.textMuted}
              style={styles.input}
            />
          </View>
          <View style={styles.stateField}>
            <Text style={styles.fieldLabel}>State</Text>
            <TextInput
              value={address.state}
              onChangeText={(v) => setAddress((a) => ({ ...a, state: v.toUpperCase().slice(0, 2) }))}
              placeholder="WA"
              placeholderTextColor={theme.color.textMuted}
              autoCapitalize="characters"
              maxLength={2}
              style={styles.input}
            />
          </View>
          <View style={styles.zipField}>
            <Text style={styles.fieldLabel}>ZIP</Text>
            <TextInput
              value={address.zip}
              onChangeText={(v) => setAddress((a) => ({ ...a, zip: v.replace(/[^\d-]/g, '').slice(0, 10) }))}
              placeholder="98004"
              placeholderTextColor={theme.color.textMuted}
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>
        </View>
        <Text style={styles.fieldLabel}>Public host slug</Text>
        <TextInput
          value={publicHost}
          onChangeText={(v) => setPublicHost(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="skbbellevue"
          placeholderTextColor={theme.color.textMuted}
          autoCapitalize="none"
          style={styles.input}
        />
        <PrimaryButton
          label={saving === 'location' ? 'Saving...' : 'Save location & web'}
          disabled={saving !== null || loading}
          onPress={() => void saveLocation()}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Brand summary</Text>
        <SummaryRow label="Template" value={brand?.websiteTemplate ?? 'saffron'} />
        <SummaryRow label="Hero headline" value={heroHeadline || 'Using template default'} />
        <Text style={styles.hint}>
          Restaurant name, website template, and hero copy are managed from the web admin.
        </Text>
      </View>
    </ScrollView>
  );
}

function dayLabel(day: DayOfWeek): string {
  const found = DAYS.find((d) => d.key === day);
  return found ? found.label : day;
}

function hasAddress(a: LocationAddress): boolean {
  return Boolean(a.street.trim() || a.city.trim() || a.state.trim() || a.zip.trim());
}

function DayHoursRow({
  day,
  label,
  entry,
  onSetClosed,
  onToggleWindow,
  onSetTime,
  onCopyToAll,
}: {
  day: DayOfWeek;
  label: string;
  entry: DayHours | 'closed' | undefined;
  onSetClosed: (closed: boolean) => void;
  onToggleWindow: (service: ServiceWindowKey, enabled: boolean) => void;
  onSetTime: (service: ServiceWindowKey, edge: 'open' | 'close', value: string) => void;
  onCopyToAll: () => void;
}) {
  const closed = entry === 'closed' || entry === undefined;
  const dayHours: DayHours = closed ? {} : entry;

  return (
    <View style={styles.dayBlock}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayLabel}>{label}</Text>
        <View style={styles.dayHeaderRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy ${label} hours to all days`}
            style={styles.copyChip}
            onPress={onCopyToAll}
          >
            <Text style={styles.copyChipText}>Copy to all</Text>
          </Pressable>
          <View style={styles.dayClosedToggle}>
            <Text style={styles.dayClosedLabel}>{closed ? 'Closed' : 'Open'}</Text>
            <Switch
              value={!closed}
              onValueChange={(v) => onSetClosed(!v)}
              trackColor={{ true: theme.color.accent, false: theme.color.line }}
              accessibilityLabel={`${label} open or closed`}
            />
          </View>
        </View>
      </View>
      {!closed && (
        <View style={styles.windows}>
          {SERVICE_WINDOWS.map(({ key, label: windowLabel }) => {
            const window = dayHours[key];
            const enabled = !!window;
            return (
              <View key={key} style={styles.windowRow}>
                <View style={styles.windowToggle}>
                  <Switch
                    value={enabled}
                    onValueChange={(v) => onToggleWindow(key, v)}
                    trackColor={{ true: theme.color.accent, false: theme.color.line }}
                    accessibilityLabel={`${label} ${windowLabel} enabled`}
                  />
                  <Text style={styles.windowLabel}>{windowLabel}</Text>
                </View>
                <View style={styles.windowTimes}>
                  <TextInput
                    value={window?.open ?? ''}
                    onChangeText={(v) => onSetTime(key, 'open', sanitizeTime(v))}
                    placeholder="HH:MM"
                    placeholderTextColor={theme.color.textMuted}
                    editable={enabled}
                    style={[styles.timeInput, !enabled && styles.timeInputDisabled]}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    accessibilityLabel={`${label} ${windowLabel} opens`}
                  />
                  <Text style={styles.timeSep}>–</Text>
                  <TextInput
                    value={window?.close ?? ''}
                    onChangeText={(v) => onSetTime(key, 'close', sanitizeTime(v))}
                    placeholder="HH:MM"
                    placeholderTextColor={theme.color.textMuted}
                    editable={enabled}
                    style={[styles.timeInput, !enabled && styles.timeInputDisabled]}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    accessibilityLabel={`${label} ${windowLabel} closes`}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function sanitizeTime(input: string): string {
  const digits = input.replace(/[^\d]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
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
  row: {
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  flex: { flex: 1 },
  stateField: { width: 70 },
  zipField: { width: 110 },
  dayBlock: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.md,
    backgroundColor: theme.color.surface,
    gap: theme.space.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  dayLabel: {
    color: theme.color.text,
    fontWeight: '700',
    fontSize: 15,
  },
  dayClosedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  dayClosedLabel: {
    color: theme.color.textMuted,
    fontSize: 13,
    fontWeight: '600',
    width: 50,
    textAlign: 'right',
  },
  copyChip: {
    paddingHorizontal: theme.space.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  copyChipText: {
    color: theme.color.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  windows: {
    gap: theme.space.xs,
    marginTop: 4,
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  windowToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    flex: 1,
  },
  windowLabel: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: '600',
  },
  windowTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeInput: {
    width: 64,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surfaceRaised,
    color: theme.color.text,
    fontSize: 14,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  timeInputDisabled: {
    opacity: 0.4,
  },
  timeSep: {
    color: theme.color.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
});
