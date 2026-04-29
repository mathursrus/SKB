import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { isAdminRole, roleLabel } from '@/core/auth';
import {
  HoursEditor,
  LocationEditor,
  MenuEditor,
  StaffSection,
  WebsiteEditor,
} from '@/features/admin';
import {
  config as configApi,
  stats as statsApi,
  type GuestFeatures,
  type HostSettings,
  type LocationAddress,
  type WeeklyHours,
} from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { Collapsible } from '@/ui/Collapsible';
import { theme } from '@/ui/theme';

const EMPTY_ADDRESS: LocationAddress = { street: '', city: '', state: '', zip: '' };

export default function SettingsScreen() {
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role);
  const locationId = useAuthStore((s) => s.locationId);
  const brand = useAuthStore((s) => s.brand);
  const canEdit = isAdminRole(role);

  // ETA state (always loaded — hosts see read-only)
  const [etaMode, setEtaMode] = useState<'manual' | 'dynamic'>('manual');
  const [turnTime, setTurnTime] = useState('8');
  const [etaDirty, setEtaDirty] = useState(false);
  const [effective, setEffective] = useState<number | null>(null);
  const [dynamicMinutes, setDynamicMinutes] = useState<number | null>(null);
  const [sampleSize, setSampleSize] = useState<number | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [savingEta, setSavingEta] = useState(false);

  // Admin config — loaded on mount when canEdit
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [hours, setHours] = useState<WeeklyHours>({});
  const [address, setAddress] = useState<LocationAddress>(EMPTY_ADDRESS);
  const [publicHost, setPublicHost] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [guestFeatures, setGuestFeatures] = useState<GuestFeatures>({ menu: true, sms: true, chat: true, order: true });
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [frontDeskPhone, setFrontDeskPhone] = useState('');
  const [cateringPhone, setCateringPhone] = useState('');
  const [voiceThreshold, setVoiceThreshold] = useState('10');
  const [smsSenderName, setSmsSenderName] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

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
    let cancelled = false;
    (async () => {
      if (!locationId) return;
      try {
        if (canEdit) {
          const [eta, site, voice, messaging, features] = await Promise.all([
            statsApi.getSettings(locationId),
            configApi.siteConfig(locationId),
            configApi.voiceConfig(locationId),
            configApi.messagingConfig(locationId),
            configApi.guestFeatures(locationId),
          ]);
          if (cancelled) return;
          applyEtaState(eta);
          setHours(site.hours ?? {});
          setAddress(site.address ?? EMPTY_ADDRESS);
          setPublicHost(site.publicHost);
          setRestaurantName(site.name);
          setVoiceEnabled(voice.voiceEnabled);
          setFrontDeskPhone(voice.frontDeskPhone);
          setCateringPhone(voice.cateringPhone ?? '');
          setVoiceThreshold(String(voice.voiceLargePartyThreshold));
          setSmsSenderName(messaging.smsSenderName);
          setGuestFeatures(features);
          setAdminLoaded(true);
        } else {
          const eta = await statsApi.getSettings(locationId);
          if (cancelled) return;
          applyEtaState(eta);
        }
        setEtaDirty(false);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load settings');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId, canEdit]);

  async function saveEta() {
    if (!locationId) return;
    const parsed = parseInt(turnTime, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 60) {
      Alert.alert('Invalid turn time', 'Please enter a number between 1 and 60.');
      return;
    }
    setSavingEta(true);
    setError(null);
    try {
      const next = await statsApi.saveSettings(locationId, { etaMode, avgTurnTimeMinutes: parsed });
      applyEtaState(next);
      setEtaDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ETA');
    } finally {
      setSavingEta(false);
    }
  }

  async function saveGuestExperience() {
    if (!locationId) return;
    setSavingKey('guest');
    setError(null);
    try {
      const next = await configApi.saveGuestFeatures(locationId, guestFeatures);
      setGuestFeatures(next);
      Alert.alert('Saved', 'Guest experience settings updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save guest settings');
    } finally {
      setSavingKey(null);
    }
  }

  async function saveFrontDesk() {
    if (!locationId) return;
    setSavingKey('frontdesk');
    setError(null);
    try {
      const next = await configApi.saveVoiceConfig(locationId, {
        voiceEnabled,
        frontDeskPhone,
        cateringPhone,
        voiceLargePartyThreshold: parseInt(voiceThreshold, 10) || 10,
      });
      setVoiceEnabled(next.voiceEnabled);
      setFrontDeskPhone(next.frontDeskPhone);
      setCateringPhone(next.cateringPhone ?? '');
      setVoiceThreshold(String(next.voiceLargePartyThreshold));
      Alert.alert('Saved', 'Front desk settings updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save front desk settings');
    } finally {
      setSavingKey(null);
    }
  }

  async function saveMessaging() {
    if (!locationId) return;
    setSavingKey('messaging');
    setError(null);
    try {
      const next = await configApi.saveMessagingConfig(locationId, { smsSenderName });
      setSmsSenderName(next.smsSenderName);
      Alert.alert('Saved', 'Messaging brand updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save messaging brand');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{roleLabel(role)} settings</Text>
        <Text style={styles.title}>{brand?.restaurantName ?? 'OSH'}</Text>
        <Text style={styles.subtitle}>
          {canEdit
            ? 'All restaurant configuration lives here. Tap a section to expand.'
            : 'Hosts can view live ETA behavior. Admins and owners change restaurant-wide settings.'}
        </Text>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {/* ETA — top, not collapsible (most-used setting) */}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save ETA"
            disabled={!etaDirty || savingEta}
            onPress={() => void saveEta()}
            style={[styles.primaryButton, (!etaDirty || savingEta) && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>{savingEta ? 'Saving…' : 'Save ETA'}</Text>
          </Pressable>
        )}
        {!canEdit && (
          <Text style={styles.readOnlyNote}>
            This screen is read-only for hosts. Sign in as an admin or owner to change restaurant-wide settings.
          </Text>
        )}
      </View>

      {/* Admin-only collapsibles */}
      {canEdit && adminLoaded && locationId && (
        <>
          <Collapsible
            title="Hours of operation"
            subtitle="Per-day open/closed and service windows. Default closed to save space."
          >
            <HoursEditor locationId={locationId} initialHours={hours} />
          </Collapsible>

          <Collapsible
            title="Location & web"
            subtitle="Address, public host slug. Powers maps and IVR."
          >
            <LocationEditor
              locationId={locationId}
              initialAddress={address}
              initialPublicHost={publicHost}
              restaurantName={restaurantName}
            />
          </Collapsible>

          <Collapsible
            title="Guest experience"
            subtitle="SMS, chat, and ordering toggles."
            defaultOpen
          >
            <Text style={styles.cardHelp}>Toggle the channels guests can use during their wait.</Text>
            <SettingRow
              label="Menu browsing"
              value={guestFeatures.menu}
              onChange={(v) => setGuestFeatures((s: GuestFeatures) => ({ ...s, menu: v }))}
            />
            <SettingRow
              label="SMS updates"
              value={guestFeatures.sms}
              onChange={(v) => setGuestFeatures((s: GuestFeatures) => ({ ...s, sms: v }))}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save guest experience"
              disabled={savingKey !== null}
              onPress={() => void saveGuestExperience()}
              style={[styles.primaryButton, savingKey !== null && styles.primaryButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {savingKey === 'guest' ? 'Saving…' : 'Save guest experience'}
              </Text>
            </Pressable>
          </Collapsible>

          <Collapsible
            title="Front desk"
            subtitle="Voice flow, front desk phone, large-party threshold."
          >
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
              accessibilityLabel="Front desk phone"
            />
            <Text style={styles.fieldLabel}>Catering phone</Text>
            <TextInput
              value={cateringPhone}
              onChangeText={setCateringPhone}
              placeholder="2065551234 (or leave blank)"
              placeholderTextColor={theme.color.textMuted}
              style={styles.input}
              keyboardType="phone-pad"
              accessibilityLabel="Catering phone"
            />
            <Text style={styles.cardHelp}>
              Press 5 in the IVR routes large or special-event callers here. Leave blank to hide that menu option.
            </Text>
            <Text style={styles.fieldLabel}>Large party threshold</Text>
            <TextInput
              value={voiceThreshold}
              onChangeText={(v) => setVoiceThreshold(v.replace(/[^\d]/g, ''))}
              placeholder="10"
              placeholderTextColor={theme.color.textMuted}
              style={[styles.input, styles.narrowInput]}
              keyboardType="number-pad"
              accessibilityLabel="Large party threshold"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save front desk"
              disabled={savingKey !== null}
              onPress={() => void saveFrontDesk()}
              style={[styles.primaryButton, savingKey !== null && styles.primaryButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {savingKey === 'frontdesk' ? 'Saving…' : 'Save front desk'}
              </Text>
            </Pressable>
          </Collapsible>

          <Collapsible
            title="Messaging brand"
            subtitle="Sender name shown at the start of every guest SMS."
          >
            <Text style={styles.cardHelp}>Every shared-number SMS starts with this restaurant name.</Text>
            <TextInput
              value={smsSenderName}
              onChangeText={setSmsSenderName}
              placeholder="Your restaurant name"
              placeholderTextColor={theme.color.textMuted}
              style={styles.input}
              accessibilityLabel="SMS sender name"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save messaging brand"
              disabled={savingKey !== null}
              onPress={() => void saveMessaging()}
              style={[styles.primaryButton, savingKey !== null && styles.primaryButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {savingKey === 'messaging' ? 'Saving…' : 'Save messaging brand'}
              </Text>
            </Pressable>
          </Collapsible>

          <Collapsible
            title="Menu"
            subtitle="Sections and items shown on the diner menu page."
          >
            <MenuEditor locationId={locationId} />
          </Collapsible>

          <Collapsible
            title="Website"
            subtitle="Template, hero, about, contact, signature dishes."
          >
            <WebsiteEditor locationId={locationId} />
          </Collapsible>

          <Collapsible
            title="Staff"
            subtitle="Active members, pending invites. Owners can invite or remove."
          >
            <StaffSection locationId={locationId} role={role} />
          </Collapsible>
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
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled: !!disabled }}
      style={[styles.segmentButton, active && styles.segmentButtonActive, disabled && styles.segmentButtonDisabled]}
      onPress={onPress}
      hitSlop={6}
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
        accessibilityLabel={label}
      />
    </View>
  );
}

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
    minHeight: 48,
    justifyContent: 'center',
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
    minHeight: 44,
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
    justifyContent: 'center',
    marginTop: theme.space.sm,
    minHeight: 48,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: theme.color.accentFg, fontWeight: '800', fontSize: 15 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  settingLabel: { color: theme.color.text, fontWeight: '600', fontSize: 15 },
  divider: { height: 1, backgroundColor: theme.color.line, marginTop: theme.space.lg },
  logoutButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.color.warn,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    marginTop: theme.space.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  logoutText: { color: theme.color.warn, fontSize: 16, fontWeight: '700' },
});
