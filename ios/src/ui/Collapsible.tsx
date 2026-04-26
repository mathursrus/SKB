import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

/**
 * A simple collapsible card section. Opens/closes when the header is tapped.
 * Used to keep long admin screens scannable — see Settings tab for the
 * Hours / Location / Staff / Menu / Website cards.
 *
 * Accessibility:
 * - Header is a button with role + expanded state
 * - Title doubles as the accessible label
 */
export function Collapsible({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
  testID,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.card} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.header}
        hitSlop={8}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>}
        </View>
        <View style={styles.headerRight}>
          {badge && (
            <View style={styles.badge} accessible accessibilityLabel={`${badge}`}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
          <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {open ? '−' : '+'}
          </Text>
        </View>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.space.lg,
    minHeight: 56, // 44pt min touch target + comfortable padding
  },
  headerText: { flex: 1, paddingRight: theme.space.md },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  title: { color: theme.color.text, fontSize: 18, fontWeight: '800' },
  subtitle: { color: theme.color.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  badge: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: { color: theme.color.textMuted, fontSize: 12, fontWeight: '700' },
  chevron: {
    color: theme.color.accent,
    fontSize: 22,
    fontWeight: '800',
    width: 24,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.lg,
    gap: theme.space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    paddingTop: theme.space.lg,
  },
});
