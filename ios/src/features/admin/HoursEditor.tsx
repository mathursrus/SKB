import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  config as configApi,
  type DayHours,
  type DayOfWeek,
  type ServiceWindowKey,
  type WeeklyHours,
} from '@/net/endpoints';
import { theme } from '@/ui/theme';

import { copyDayToAll, sanitizeTime, setDayClosed, setWindowTime, toggleWindow, dayLabel, DAYS, SERVICE_WINDOWS } from './hoursLogic';

export function HoursEditor({
  locationId,
  initialHours,
}: {
  locationId: string;
  initialHours: WeeklyHours;
}) {
  const [hours, setHours] = useState<WeeklyHours>(initialHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await configApi.saveSiteConfig(locationId, { hours });
      setHours(next.hours ?? {});
      Alert.alert('Saved', 'Hours updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save hours');
    } finally {
      setSaving(false);
    }
  }

  function handleCopyAll(sourceDay: DayOfWeek) {
    setHours((prev) => copyDayToAll(prev, sourceDay));
    Alert.alert('Copied', `${dayLabel(sourceDay)} hours copied to all days.`);
  }

  return (
    <View style={styles.wrap}>
      {error !== null && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.help}>
        Per-day windows shown to guests, used by the IVR, and shown on the website. Times are 24-hour HH:MM.
      </Text>
      {DAYS.map(({ key, label }) => (
        <DayHoursRow
          key={key}
          day={key}
          label={label}
          entry={hours[key]}
          onSetClosed={(closed) => setHours((p) => setDayClosed(p, key, closed))}
          onToggleWindow={(service, enabled) =>
            setHours((p) => toggleWindow(p, key, service, enabled))
          }
          onSetTime={(service, edge, value) =>
            setHours((p) => setWindowTime(p, key, service, edge, value))
          }
          onCopyToAll={() => handleCopyAll(key)}
        />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save hours"
        disabled={saving}
        onPress={() => void save()}
        style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save hours'}</Text>
      </Pressable>
    </View>
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
            hitSlop={6}
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

const styles = StyleSheet.create({
  wrap: { gap: theme.space.md },
  error: { color: theme.color.warn, fontWeight: '600' },
  help: { color: theme.color.textMuted, fontSize: 13, lineHeight: 18 },
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
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
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
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.line,
    minHeight: 32,
    justifyContent: 'center',
  },
  copyChipText: { color: theme.color.textMuted, fontSize: 11, fontWeight: '700' },
  windows: { gap: theme.space.xs, marginTop: 4 },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    minHeight: 44,
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
    minHeight: 36,
  },
  timeInputDisabled: { opacity: 0.4 },
  timeSep: { color: theme.color.textMuted, fontSize: 14, fontWeight: '700' },
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
});
