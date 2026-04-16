import { Ionicons } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { theme } from './theme';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';
type IonIconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  label: string;
  icon?: IonIconName;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  disabled?: boolean;
  badge?: number;
  accessibilityLabel?: string;
  title?: string;
  compact?: boolean;
  newFeature?: boolean;
}

export const Button = forwardRef<View, Props>(function Button(
  { label, icon, onPress, variant = 'default', disabled, badge, accessibilityLabel, compact, newFeature },
  ref,
) {
  const style = [
    styles.base,
    compact && styles.compact,
    variant === 'primary' && styles.primary,
    variant === 'danger' && styles.danger,
    variant === 'ghost' && styles.ghost,
    newFeature && styles.newFeature,
    disabled && styles.disabled,
  ];
  const textStyle = [
    styles.label,
    variant === 'primary' && styles.labelPrimary,
    variant === 'danger' && styles.labelDanger,
    variant === 'ghost' && styles.labelGhost,
  ];

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && !disabled && styles.pressed]}
    >
      {icon !== undefined && (
        <Ionicons
          name={icon}
          size={14}
          color={
            variant === 'primary' ? '#2a1a00'
              : variant === 'danger' ? theme.color.warn
              : variant === 'ghost' ? theme.color.textMuted
              : theme.color.text
          }
        />
      )}
      <Text style={textStyle} numberOfLines={1}>
        {label}
      </Text>
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'relative',
  },
  compact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  primary: {
    backgroundColor: theme.color.accent,
    borderColor: '#ff9a1f',
  },
  danger: {
    backgroundColor: 'transparent',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
  },
  newFeature: {
    borderColor: 'rgba(255,179,71,0.6)',
  },
  label: {
    color: theme.color.text,
    fontSize: 13,
    fontWeight: '600',
  },
  labelPrimary: {
    color: '#2a1a00',
  },
  labelDanger: {
    color: theme.color.warn,
  },
  labelGhost: {
    color: theme.color.textMuted,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    paddingHorizontal: 4,
    backgroundColor: theme.color.warn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#2a0808',
    fontSize: 10,
    fontWeight: '800',
  },
});
