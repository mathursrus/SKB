import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { theme } from './theme';

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

const DESKTOP_WIDTH = 420;

export function SlideOver({ visible, title, subtitle, onClose, children }: Props) {
  const screenWidth = Dimensions.get('window').width;
  const width = Math.min(screenWidth, DESKTOP_WIDTH);
  const translate = useSharedValue(width);

  useEffect(() => {
    translate.value = withTiming(visible ? 0 : width, { duration: 200 });
  }, [visible, width, translate]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss slide-over"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.drawer,
            { width },
            animStyle,
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawer: {
    backgroundColor: theme.color.surface,
    borderLeftWidth: 1,
    borderLeftColor: theme.color.line,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  title: {
    color: theme.color.text,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.color.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  closeText: {
    color: theme.color.textMuted,
    fontSize: 26,
    paddingHorizontal: theme.space.sm,
  },
});
