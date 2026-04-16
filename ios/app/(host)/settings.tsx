import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { stats as statsApi } from '@/net/endpoints';
import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

export default function SettingsScreen() {
  const logout = useAuthStore((s) => s.logout);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [etaMode, setEtaMode] = useState<'manual' | 'dynamic'>('manual');
  const [turnTime, setTurnTime] = useState('8');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [effective, setEffective] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await statsApi.getSettings();
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
  }, []);

  async function handleSave() {
    const parsed = parseInt(turnTime, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 60) {
      Alert.alert('Invalid turn time', 'Please enter a number between 1 and 60.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const s = await statsApi.saveSettings({ etaMode, avgTurnTimeMinutes: parsed });
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
      <Text style={styles.header}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ETA Mode</Text>
        <Text style={styles.sectionHelp}>
          Manual uses the turn time below for every party; Dynamic estimates wait from
          recent seating history.
        </Text>
        <View style={styles.segment}>
          <SegmentButton
            label="Manual"
            active={etaMode === 'manual'}
            onPress={() => {
              setEtaMode('manual');
              setDirty(true);
            }}
          />
          <SegmentButton
            label="Dynamic"
            active={etaMode === 'dynamic'}
            onPress={() => {
              setEtaMode('dynamic');
              setDirty(true);
            }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {etaMode === 'manual' ? 'Turn time (minutes per party)' : 'Fallback turn time (minutes)'}
        </Text>
        <Text style={styles.sectionHelp}>
          {etaMode === 'manual'
            ? 'Used as the per-party ETA estimate for every new join.'
            : 'Used only when we have too little seating history to compute a dynamic ETA.'}
        </Text>
        <TextInput
          value={turnTime}
          onChangeText={(v) => {
            setTurnTime(v.replace(/[^\d]/g, ''));
            setDirty(true);
          }}
          keyboardType="number-pad"
          maxLength={2}
          style={styles.input}
          accessibilityLabel="Turn time minutes"
        />
        {effective !== null && (
          <Text style={styles.effective}>
            Active ETA · <Text style={styles.effectiveValue}>{effective}m</Text>
          </Text>
        )}
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save settings"
        disabled={!dirty || saving || loading}
        style={[styles.saveButton, (!dirty || saving || loading) && styles.saveButtonDisabled]}
        onPress={() => void handleSave()}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save settings'}</Text>
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

      <BuildInfo />
    </ScrollView>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function BuildInfo() {
  const apiBase =
    (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl
    ?? (process.env as { EXPO_PUBLIC_API_BASE_URL?: string }).EXPO_PUBLIC_API_BASE_URL
    ?? '(default)';
  const updateId = Updates.updateId ?? 'embedded';
  const shortId = updateId === 'embedded' ? 'embedded' : updateId.slice(0, 8);
  const channel = Updates.channel ?? '—';
  let host = apiBase;
  try { host = new URL(apiBase).host; } catch { /* ignore */ }
  return (
    <Text style={{ textAlign: 'center', fontSize: 10, color: theme.color.textMuted, marginTop: theme.space.xl }}>
      build · {channel} · {shortId} · {host}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  content: { padding: theme.space.lg, paddingBottom: theme.space.xxl },
  header: {
    color: theme.color.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: theme.space.xl,
  },
  section: { marginBottom: theme.space.xl },
  sectionLabel: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: '600',
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
  segmentButtonText: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '600',
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
  effective: {
    color: theme.color.textMuted,
    fontSize: 13,
    marginTop: theme.space.sm,
  },
  effectiveValue: { color: theme.color.accent, fontWeight: '700' },
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
  logoutText: { color: theme.color.warn, fontSize: 16, fontWeight: '600' },
});
