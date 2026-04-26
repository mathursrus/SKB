import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { isAdminRole, roleLabel } from '@/core/auth';
import { buildAdminUrl } from '@/net/client';
import {
  config as configApi,
  stats as statsApi,
  type DayHours,
  type DayOfWeek,
  type HostSettings,
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

export default function SettingsScreen() {
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role);
  const locationId = useAuthStore((s) => s.locationId);
  const brand = useAuthStore((s) => s.brand);
  const canEdit = isAdminRole(role);

  // ETA state
  const [etaMode, setEtaMode] = useState<'manual' | 'dynamic'>('manual');
  const [turnTime, setTurnTime] = useState('8');
  const [etaDirty, setEtaDirty] = useState(false);
  const [effective, setEffective] = useState<number | null>(null);
  const [dynamicMinutes, setDynamicMinutes] = useState<number | null>(null);
  const [sampleSize, setSampleSize] = useState<number | null>(null);
  const [fellBack, setFellBack] = useState(false);

  // Config state (admin-only)
  const [hours, setHours] = useState<WeeklyHours>({});
  const [address, setAddress] = useState<LocationAddress>(EMPTY_ADDRESS);
  const [publicHost, setPublicHost] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [guestFeatures, setGuestFeatures] = useState({ sms: true, chat: true, order: true });
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [frontDeskPhone, setFrontDeskPhone] = useState('');
  const [voiceThreshold, setVoiceThreshold] = useState('10');
  const [smsSenderName, setSmsSenderName] = useState('');
  const [heroHeadline, setHeroHeadline] = useState('');

  // Lifecycle
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyEtaState(s: HostSettings) {
    setEtaMode(s.etaMode);
    setTurnTime(String(s.avgTurnTimeMinutes ?? 8));
    setEffective(s.effectiveMinutes);
    setDynamicMinutes(s.dynamicMinutes ?? null);
    setSampleSize(s.sampleSize ?? null);
    setFellBack(!!s.fellBackToManual);
  }

  useEffect(() => {
    (async () => {
      if (!locationId) return;
      try {
        if (canEdit) {
          const [eta, site, voice, messaging, features, website] = await Promise.all([
            statsApi.getSettings(locationId),
            configApi.siteConfig(locationId),
            configApi.voiceConfig(locationId),
            configApi.messagingConfig(locationId),
            configApi.guestFeatures(locationId),
            configApi.websiteConfig(locationId),
          ]);
          applyEtaState(eta);
          setHours(site.hours ?? {});
          setAddress(site.address ?? EMPTY_ADDRESS);
          setPublicHost(site.publicHost);
          setRestaurantName(site.name);
          setVoiceEnabled(voice.voiceEnabled);
          setFrontDeskPhone(voice.frontDeskPhone);
          setVoiceThreshold(String(voice.voiceLargePartyThreshold));
          setSmsSenderName(messaging.smsSenderName);
          setGuestFeatures(features);
          setHeroHeadline(website.content?.heroHeadline ?? '');
        } else {
          // Hosts only see ETA — skip the admin-only fetches
          const eta = await statsApi.getSettings(locationId);
          applyEtaState(eta);
        }
        setEtaDirty(false);
      } catch (err) {
        setError((err as Error).message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId, canEdit]);

  async function saveEta() {
    if (!locationId) return;
    const parsed = parseInt(turnTime, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 60) {
      Alert.alert('Invalid turn time', 'Please enter a number between 1 and 60.');
      return;
    }
    setSaving('eta');
    setError(null);
    try {
      const next = await statsApi.saveSettings(locationId, { etaMode, avgTurnTimeMinutes: parsed });
      applyEtaState(next);
      setEtaDirty(false);
    } catch (err) {
      setError((err as Error).message || 'Failed to save ETA');
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
      Alert.alert('Saved', 'Messaging brand updated.');
    } catch (err) {
      setError((err as Error).message || 'Failed to save messaging brand');
    } finally {
      setSaving(null);
    }
  }

  function setDayClosed(day: DayOfWeek, closed: boolean) {
    setHours((prev) => {
      const next: WeeklyHours = { ...prev };
      next[day] = closed
        ? 'closed'
        : { lunch: { open: '11:30', close: '14:30' }, dinner: { open: '17:30', close: '21:30' } };
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

  function openWebAdmin(tab: string) {
    if (!locationId) return;
    void Linking.openURL(buildAdminUrl(locationId, tab));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{roleLabel(role)} settings</Text>
        <Text style={styles.title}>{brand?.restaurantName ?? 'OSH'}</Text>
        <Text style={styles.subtitle}>
          {canEdit
            ? 'Configure how your restaurant runs: ETA estimates, hours, guest features, front desk, and brand.'
            : 'Hosts can view live ETA behavior. Admins and owners change restaurant-wide settings.'}
        </Text>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {/* ─── ETA & wait estimates ──────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ETA estimates</Text>
        <Text style={styles.cardHelp}>
          Manual uses the turn time below for every party. Dynamic estimates wait from recent seating history.
        </Text>
        <View style={styles.segment}>
          <SegmentButton
            label="Manual"
            active={etaMode === 'manual'}
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return;
              setEtaMode('manual');
              setEtaDirty(true);
            }}
          />
          <SegmentButton
            label="Dynamic"
            active={etaMode === 'dynamic'}
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return;
              setEtaMode('dynamic');
              setEtaDirty(true);
            }}
          />
        </View>

        <Text style={styles.fieldLabel}>Turn time (minutes per party)</Text>
        <TextInput
          value={turnTime}
          onChangeText={(v) => {
            if (!canEdit) return;
            setTurnTime(v.replace(/[^\d]/g, ''));
            setEtaDirty(true);
          }}
          keyboardType="number-pad"
          maxLength={2}
          editable={canEdit && etaMode === 'manual'}
          style={[styles.input, styles.narrowInput, (!canEdit || etaMode !== 'manual') && styles.inputDisabled]}
          accessibilityLabel="Turn time minutes"
        />

        {effective !== null && (
          <Text style={styles.effective}>
            Active ETA · <Text style={styles.effectiveValue}>{effective}m</Text>
            {etaMode === 'dynamic' && sampleSize !== null && (
              <Text style={styles.muted}>
                {' '}
                · {sampleSize} recent {sampleSize === 1 ? 'seating' : 'seatings'}
              </Text>
            )}
          </Text>
        )}

        {etaMode === 'dynamic' && fellBack && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningTitle}>Dynamic mode is using the manual fallback</Text>
            <Text style={styles.warningBody}>
              Not enough recent seatings to compute a reliable estimate. The active ETA is the manual turn time
              above. Dynamic will take over automatically as your team seats more parties.
            </Text>
          </View>
        )}

        {etaMode === 'dynamic' && !fellBack && dynamicMinutes !== null && (
          <Text style={styles.muted}>
            Dynamic estimate: <Text style={styles.boldText}>{dynamicMinutes}m</Text>
          </Text>
        )}

        {canEdit && (
          <PrimaryButton
            label={saving === 'eta' ? 'Saving...' : 'Save ETA'}
            disabled={!etaDirty || saving !== null || loading}
            onPress={() => void saveEta()}
          />
        )}

        {!canEdit && (
          <Text style={styles.readOnlyNote}>
            This screen is read-only for hosts. Sign in as an admin or owner to change restaurant-wide settings.
          </Text>
        )}
      </View>

      {/* ─── Admin-only sections ───────────────────────────────────── */}
      {canEdit && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hours of operation</Text>
            <Text style={styles.cardHelp}>
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
            <Text style={styles.cardHelp}>
              Address powers maps embeds and the IVR location prompt. Public host is your diner-facing slug
              (e.g. `skbbellevue`).
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
            <Text style={styles.cardTitle}>Guest experience</Text>
            <Text style={styles.cardHelp}>Toggle the channels guests can use during their wait.</Text>
            <SettingRow
              label="SMS updates"
              value={guestFeatures.sms}
              onChange={(v) => setGuestFeatures((s) => ({ ...s, sms: v }))}
            />
            <SettingRow
              label="Guest chat"
              value={guestFeatures.chat}
              onChange={(v) => setGuestFeatures((s) => ({ ...s, chat: v }))}
            />
            <SettingRow
              label="Guest ordering"
              value={guestFeatures.order}
              onChange={(v) => setGuestFeatures((s) => ({ ...s, order: v }))}
            />
            <PrimaryButton
              label={saving === 'guest' ? 'Saving...' : 'Save guest experience'}
              disabled={saving !== null || loading}
              onPress={() => void saveGuestExperience()}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Front desk</Text>
            <Text style={styles.cardHelp}>Voice flow controls and large-party transfer threshold.</Text>
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
              onChangeText={(v) => setVoiceThreshold(v.replace(/[^\d]/g, ''))}
              placeholder="10"
              placeholderTextColor={theme.color.textMuted}
              style={[styles.input, styles.narrowInput]}
              keyboardType="number-pad"
            />
            <PrimaryButton
              label={saving === 'frontdesk' ? 'Saving...' : 'Save front desk'}
              disabled={saving !== null || loading}
              onPress={() => void saveFrontDesk()}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Messaging brand</Text>
            <Text style={styles.cardHelp}>Every shared-number SMS starts with this restaurant name.</Text>
            <TextInput
              value={smsSenderName}
              onChangeText={setSmsSenderName}
              placeholder="Shri Krishna Bhavan"
              placeholderTextColor={theme.color.textMuted}
              style={styles.input}
            />
            <PrimaryButton
              label={saving === 'messaging' ? 'Saving...' : 'Save messaging brand'}
              disabled={saving !== null || loading}
              onPress={() => void saveMessaging()}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Brand summary</Text>
            <SummaryRow label="Template" value={brand?.websiteTemplate ?? 'saffron'} />
            <SummaryRow label="Hero headline" value={heroHeadline || 'Using template default'} />
            <Text style={styles.cardHelp}>
              Restaurant name, website template, and hero copy are managed from the web admin.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>More admin tools</Text>
            <Text style={styles.cardHelp}>
              Staff invites, menu editing, and website content live in the web admin.
            </Text>
            <View style={styles.linkList}>
              <LinkRow label="Manage staff (web admin)" onPress={() => openWebAdmin('staff')} />
              <LinkRow label="Edit menu (web admin)" onPress={() => openWebAdmin('menu')} />
              <LinkRow label="Website content (web admin)" onPress={() => openWebAdmin('website')} />
            </View>
          </View>
        </>
      )}

      <View style={styles.divider} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={styles.logoutButton}
        onPress={() => void logout()}
      >
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Helper components ────────────────────────────────────────────────────

function SegmentButton({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      style={[styles.segmentButton, active && styles.segmentButtonActive, disabled && styles.segmentButtonDisabled]}
      onPress={onPress}
    >
      <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>{label}</Text>
    </Pressable>
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
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.color.accent, false: theme.color.line }}
      />
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
    <Pressable
      style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} style={styles.linkRow} onPress={onPress}>
      <Text style={styles.linkLabel}>{label}</Text>
      <Text style={styles.linkArrow}>↗</Text>
    </Pressable>
  );
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

// ─── Helpers ──────────────────────────────────────────────────────────────

function dayLabel(day: DayOfWeek): string {
  const found = DAYS.find((d) => d.key === day);
  return found ? found.label : day;
}

function hasAddress(a: LocationAddress): boolean {
  return Boolean(a.street.trim() || a.city.trim() || a.state.trim() || a.zip.trim());
}

function sanitizeTime(input: string): string {
  const digits = input.replace(/[^\d]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  content: { padding: theme.space.lg, gap: theme.space.lg, paddingBottom: theme.space.xxl },
  hero: {
    borderRadius: 24,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.xl,
  },
  eyebrow: {
    color: theme.color.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
  },
  title: { color: theme.color.text, fontSize: 28, fontWeight: '800', marginTop: 8 },
  subtitle: { color: theme.color.textMuted, fontSize: 14, lineHeight: 20, marginTop: 8 },
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
  cardHelp: { color: theme.color.textMuted, fontSize: 13, lineHeight: 18 },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  segment: { flexDirection: 'row', gap: theme.space.sm },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    alignItems: 'center',
    backgroundColor: theme.color.surface,
  },
  segmentButtonActive: { borderColor: theme.color.accent, backgroundColor: theme.color.accent },
  segmentButtonDisabled: { opacity: 0.55 },
  segmentButtonText: { color: theme.color.text, fontSize: 15, fontWeight: '700' },
  segmentButtonTextActive: { color: theme.color.accentFg },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    color: theme.color.text,
    backgroundColor: theme.color.surface,
    fontSize: 15,
  },
  narrowInput: { width: 96, textAlign: 'center', fontVariant: ['tabular-nums'] },
  inputDisabled: { opacity: 0.45, color: theme.color.textMuted },
  effective: { color: theme.color.textMuted, fontSize: 13 },
  effectiveValue: { color: theme.color.accent, fontWeight: '700' },
  muted: { color: theme.color.textMuted, fontSize: 13 },
  boldText: { color: theme.color.text, fontWeight: '700' },
  warningBanner: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.warn,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: 4,
  },
  warningTitle: { color: theme.color.warn, fontWeight: '700', fontSize: 13 },
  warningBody: { color: theme.color.textMuted, fontSize: 13, lineHeight: 18 },
  readOnlyNote: { color: theme.color.textMuted, fontSize: 13 },
  primaryButton: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    paddingVertical: theme.space.md,
    alignItems: 'center',
    marginTop: theme.space.sm,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: theme.color.accentFg, fontWeight: '800', fontSize: 15 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: { color: theme.color.text, fontWeight: '600', fontSize: 15 },
  summaryRow: { gap: 4 },
  summaryLabel: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  summaryValue: { color: theme.color.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: theme.space.sm },
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
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  dayLabel: { color: theme.color.text, fontWeight: '700', fontSize: 15 },
  dayClosedToggle: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
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
  copyChipText: { color: theme.color.textMuted, fontSize: 11, fontWeight: '700' },
  windows: { gap: theme.space.xs, marginTop: 4 },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  windowToggle: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, flex: 1 },
  windowLabel: { color: theme.color.text, fontSize: 14, fontWeight: '600' },
  windowTimes: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  timeInputDisabled: { opacity: 0.4 },
  timeSep: { color: theme.color.textMuted, fontSize: 14, fontWeight: '700' },
  linkList: { gap: theme.space.sm },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  linkLabel: { color: theme.color.text, fontSize: 15, fontWeight: '600' },
  linkArrow: { color: theme.color.accent, fontSize: 16, fontWeight: '700' },
  divider: { height: 1, backgroundColor: theme.color.line, marginTop: theme.space.lg },
  logoutButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.color.warn,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    marginTop: theme.space.md,
  },
  logoutText: { color: theme.color.warn, fontSize: 16, fontWeight: '700' },
});
