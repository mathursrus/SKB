import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { isAdminRole, roleLabel } from '@/core/auth';
import { stats as statsApi } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

export default function SettingsScreen() {
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role);
  const locationId = useAuthStore((s) => s.locationId);
  const brand = useAuthStore((s) => s.brand);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [etaMode, setEtaMode] = useState<'manual' | 'dynamic'>('manual');
  const [turnTime, setTurnTime] = useState('8');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [effective, setEffective] = useState<number | null>(null);
  const canEdit = isAdminRole(role);

  useEffect(() => {
    (async () => {
      if (!locationId) return;
      try {
        const s = await statsApi.getSettings(locationId);
        setEtaMode(s.etaMode);
        setTurnTime(String(s.avgTurnTimeMinutes ?? 8));
        setEffective(s.effectiveMinutes);
        setDirty(false);
      } catch (err) {
        setError((err as Error).message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId]);

  async function handleSave() {
    if (!locationId) return;
    const parsed = parseInt(turnTime, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 60) {
      Alert.alert('Invalid turn time', 'Please enter a number between 1 and 60.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const s = await statsApi.saveSettings(locationId, { etaMode, avgTurnTimeMinutes: parsed });
      setEffective(s.effectiveMinutes);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{roleLabel(role)} settings</Text>
        <Text style={styles.title}>{brand?.restaurantName ?? 'OSH'}</Text>
        <Text style={styles.subtitle}>
          Hosts can view live ETA behavior. Admins and owners can tune the estimate used across the restaurant.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ETA mode</Text>
        <Text style={styles.sectionHelp}>
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
              setDirty(true);
            }}
          />
          <SegmentButton
            label="Dynamic"
            active={etaMode === 'dynamic'}
            disabled={!canEdit}
            onPress={() => {
              if (!canEdit) return;
              setEtaMode('dynamic');
              setDirty(true);
            }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Turn time (minutes per party)</Text>
        <Text style={styles.sectionHelp}>
          {etaMode === 'manual'
            ? 'Used as the per-party ETA estimate for every new join.'
            : 'Locked in Dynamic mode. Switch to Manual to override it.'}
        </Text>
        <TextInput
          value={turnTime}
          onChangeText={(v) => {
            if (!canEdit) return;
            setTurnTime(v.replace(/[^\d]/g, ''));
            setDirty(true);
          }}
          keyboardType="number-pad"
          maxLength={2}
          editable={etaMode === 'manual'}
          style={[styles.input, (!canEdit || etaMode !== 'manual') && styles.inputDisabled]}
          accessibilityLabel="Turn time minutes"
          accessibilityState={{ disabled: !canEdit || etaMode !== 'manual' }}
        />
        {effective !== null && (
          <Text style={styles.effective}>
            Active ETA · <Text style={styles.effectiveValue}>{effective}m</Text>
          </Text>
        )}
        {!canEdit && (
          <Text style={styles.readOnlyNote}>
            This screen is read-only for hosts. Sign in as an admin or owner to change restaurant-wide settings.
          </Text>
        )}
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save settings"
        disabled={!canEdit || !dirty || saving || loading}
        style={[styles.saveButton, (!canEdit || !dirty || saving || loading) && styles.saveButtonDisabled]}
        onPress={() => void handleSave()}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save settings'}</Text>
      </Pressable>

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
      accessibilityState={{ selected: active, disabled: !!disabled }}
      style={[styles.segmentButton, active && styles.segmentButtonActive, disabled && styles.segmentButtonDisabled]}
      onPress={onPress}
    >
      <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  content: { padding: theme.space.lg, paddingBottom: theme.space.xxl },
  hero: {
    borderRadius: 24,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space.xl,
    marginBottom: theme.space.xl,
  },
  eyebrow: {
    color: theme.color.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
  },
  title: {
    color: theme.color.text,
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  subtitle: {
    color: theme.color.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  section: { marginBottom: theme.space.xl },
  sectionLabel: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionHelp: {
    color: theme.color.textMuted,
    fontSize: 13,
    marginBottom: theme.space.sm,
  },
  segment: {
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    alignItems: 'center',
    backgroundColor: theme.color.surfaceRaised,
  },
  segmentButtonActive: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.accent,
  },
  segmentButtonDisabled: {
    opacity: 0.55,
  },
  segmentButtonText: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '700',
  },
  segmentButtonTextActive: { color: theme.color.accentFg },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    color: theme.color.text,
    backgroundColor: theme.color.surfaceRaised,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    width: 96,
  },
  inputDisabled: {
    opacity: 0.45,
    color: theme.color.textMuted,
  },
  effective: {
    color: theme.color.textMuted,
    fontSize: 13,
    marginTop: theme.space.sm,
  },
  effectiveValue: { color: theme.color.accent, fontWeight: '700' },
  readOnlyNote: {
    color: theme.color.textMuted,
    fontSize: 13,
    marginTop: theme.space.md,
  },
  error: { color: theme.color.warn, fontSize: 13, marginBottom: theme.space.sm },
  saveButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.color.accent,
    paddingHorizontal: theme.space.xl,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    marginTop: theme.space.sm,
  },
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonText: {
    color: theme.color.accentFg,
    fontSize: 15,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.line,
    marginVertical: theme.space.xl,
  },
  logoutButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.color.warn,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
  },
  logoutText: { color: theme.color.warn, fontSize: 16, fontWeight: '700' },
});
