import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { HostSentiment, HostSentimentSource } from '@/core/party';
import { theme } from '@/ui/theme';

const META: Record<HostSentiment, { emoji: string; label: string }> = {
  happy: { emoji: '🙂', label: 'Good' },
  neutral: { emoji: '😐', label: 'Waiting' },
  upset: { emoji: '😠', label: 'Needs attention' },
};

const PICKER_OPTIONS: Array<{ value: HostSentiment | null; emoji: string; label: string }> = [
  { value: null, emoji: '⚙️', label: 'Auto' },
  { value: 'happy', emoji: '🙂', label: 'Good' },
  { value: 'neutral', emoji: '😐', label: 'Waiting' },
  { value: 'upset', emoji: '😠', label: 'Needs attention' },
];

/**
 * Small inline badge that mirrors the website's renderSentimentBadge.
 * Renders the emoji + label of the current sentiment; falls back to
 * the neutral "Waiting" face when the server hasn't supplied one yet.
 */
export function SentimentBadge({
  sentiment,
  source,
}: {
  sentiment?: HostSentiment;
  source?: HostSentimentSource;
}) {
  const meta = META[sentiment ?? 'neutral'];
  const sourceLabel = source === 'manual' ? 'Host override' : 'Automatic';
  return (
    <View
      accessibilityLabel={`${sourceLabel}: ${meta.label}`}
      style={[styles.badge, sentimentStyles[sentiment ?? 'neutral']]}
    >
      <Text style={styles.badgeEmoji}>{meta.emoji}</Text>
      <Text style={styles.badgeText}>{meta.label}</Text>
    </View>
  );
}

/**
 * Sentiment picker — tappable badge that opens a modal sheet with
 * Auto / 🙂 Good / 😐 Waiting / 😠 Needs attention. The web equivalent
 * is a `<select>`; on iOS a sheet is the platform-native picker shape.
 */
export function SentimentPicker({
  partyName,
  sentiment,
  source,
  onChange,
}: {
  partyName: string;
  sentiment?: HostSentiment;
  source?: HostSentimentSource;
  onChange: (next: HostSentiment | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedValue: HostSentiment | null = source === 'manual' && sentiment ? sentiment : null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set sentiment for ${partyName}. Currently ${source === 'manual' ? 'host override' : 'automatic'}.`}
        accessibilityHint="Opens a picker to override the automatic sentiment."
        onPress={() => setOpen(true)}
        // Bumped from 6 → 12 so the small inline badge meets iOS HIG's
        // 44pt tap-target minimum once hitSlop expands the touch area.
        hitSlop={12}
        style={({ pressed }) => [pressed && styles.badgePressed]}
      >
        <View style={styles.badgeWithCaret}>
          <SentimentBadge sentiment={sentiment} source={source} />
          {/* Tiny caret hints that the badge is interactive — without it
              hosts read it as a static label and never discover the
              picker. The web equivalent is a native <select> arrow. */}
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
          accessibilityLabel="Dismiss sentiment picker"
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Sentiment for {partyName}</Text>
            {PICKER_OPTIONS.map((opt) => {
              const active = opt.value === selectedValue;
              return (
                <Pressable
                  key={String(opt.value ?? 'auto')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setOpen(false);
                    onChange(opt.value);
                  }}
                  style={[styles.option, active && styles.optionActive]}
                  hitSlop={6}
                >
                  <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  {active && <Text style={styles.optionCheck}>✓</Text>}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const sentimentStyles = StyleSheet.create({
  happy: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.55)' },
  neutral: { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.line },
  upset: { backgroundColor: 'rgba(248, 113, 113, 0.18)', borderColor: 'rgba(248, 113, 113, 0.6)' },
});

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeEmoji: { fontSize: 12 },
  badgeText: {
    color: theme.color.text,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  badgeWithCaret: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  badgePressed: {
    opacity: 0.65,
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
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
  sheetTitle: {
    color: theme.color.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
    marginBottom: theme.space.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surfaceRaised,
    minHeight: 52,
  },
  optionActive: {
    borderColor: theme.color.accent,
    backgroundColor: 'rgba(192, 135, 46, 0.12)',
  },
  optionEmoji: { fontSize: 22 },
  optionLabel: { color: theme.color.text, fontSize: 15, fontWeight: '600', flex: 1 },
  optionLabelActive: { color: theme.color.accent },
  optionCheck: { color: theme.color.accent, fontSize: 18, fontWeight: '700' },
});
