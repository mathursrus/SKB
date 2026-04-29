import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/ui/theme';

const ADJUSTMENTS: ReadonlyArray<{ delta: number; label: string }> = [
  { delta: -10, label: '−10m' },
  { delta: -5, label: '−5m' },
  { delta: 5, label: '+5m' },
  { delta: 10, label: '+10m' },
  { delta: 15, label: '+15m' },
];

function formatClockTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function EtaEditor({
  partyName,
  currentEtaAt,
  onSave,
}: {
  partyName: string;
  currentEtaAt: string;
  onSave: (next: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const original = new Date(currentEtaAt);
  const [draft, setDraft] = useState<Date>(original);

  useEffect(() => {
    if (open) setDraft(new Date(currentEtaAt));
  }, [open, currentEtaAt]);

  const validDraft = !Number.isNaN(draft.valueOf());
  const validOriginal = !Number.isNaN(original.valueOf());
  const dirty = validDraft && validOriginal && draft.valueOf() !== original.valueOf();

  function adjust(deltaMinutes: number) {
    setDraft((prev) => new Date(prev.valueOf() + deltaMinutes * 60_000));
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ETA for ${partyName}. Currently ${validOriginal ? formatClockTime(original) : 'unset'}.`}
        accessibilityHint="Opens a sheet to push the ETA earlier or later."
        onPress={() => setOpen(true)}
        hitSlop={12}
        style={({ pressed }) => [pressed && styles.badgePressed]}
      >
        <View style={styles.badgeWithCaret}>
          <Text style={styles.timeValue}>{validOriginal ? formatClockTime(original) : '—'}</Text>
          <Text style={styles.caret}>▾</Text>
        </View>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel="Dismiss ETA editor"
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>ETA for {partyName}</Text>
            <View style={styles.draftBlock}>
              <Text style={styles.draftLabel}>NEW ETA</Text>
              <Text style={styles.draftValue}>{validDraft ? formatClockTime(draft) : '—'}</Text>
              {dirty && validOriginal && (
                <Text style={styles.draftHint}>was {formatClockTime(original)}</Text>
              )}
            </View>
            <View style={styles.adjustRow}>
              {ADJUSTMENTS.map((a) => (
                <Pressable
                  key={a.delta}
                  accessibilityRole="button"
                  accessibilityLabel={`Adjust ETA by ${a.label}`}
                  onPress={() => adjust(a.delta)}
                  style={({ pressed }) => [styles.adjustChip, pressed && styles.adjustChipPressed]}
                  hitSlop={6}
                >
                  <Text style={styles.adjustChipText}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setOpen(false)}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                hitSlop={6}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save new ETA"
                accessibilityState={{ disabled: !dirty }}
                disabled={!dirty}
                onPress={() => {
                  setOpen(false);
                  onSave(draft);
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  !dirty && styles.primaryButtonDisabled,
                  pressed && styles.buttonPressed,
                ]}
                hitSlop={6}
              >
                <Text style={[styles.primaryButtonText, !dirty && styles.primaryButtonTextDisabled]}>
                  Save
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badgeWithCaret: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  badgePressed: { opacity: 0.65 },
  timeValue: {
    color: theme.color.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  caret: {
    color: theme.color.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: theme.space.lg,
    gap: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  sheetTitle: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  draftBlock: {
    alignItems: 'center',
    paddingVertical: theme.space.md,
    backgroundColor: theme.color.surfaceRaised,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  draftLabel: {
    color: theme.color.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  draftValue: {
    color: theme.color.text,
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  draftHint: {
    color: theme.color.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  adjustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
    justifyContent: 'center',
  },
  adjustChip: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surfaceRaised,
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjustChipPressed: { opacity: 0.6 },
  adjustChipText: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.space.sm,
    marginTop: theme.space.sm,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: theme.space.md,
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  primaryButtonText: {
    color: theme.color.accentFg,
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButtonTextDisabled: { color: theme.color.textMuted },
  secondaryButton: {
    flex: 1,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surfaceRaised,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: theme.color.text,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonPressed: { opacity: 0.7 },
});
