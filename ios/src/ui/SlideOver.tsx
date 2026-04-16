import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
          accessibilityLabel="Dismiss chat"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <Animated.View style={[styles.drawer, { width }, animStyle]} accessibilityViewIsModal>
          <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.fill}
              // Account for the drawer header so the composer lifts cleanly above the keyboard
              keyboardVerticalOffset={0}
            >
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{title}</Text>
                  {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close chat"
                  onPress={onClose}
                  hitSlop={12}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
                >
                  <Ionicons name="close" size={22} color={theme.color.text} />
                </Pressable>
              </View>
              <View style={styles.body}>{children}</View>
            </KeyboardAvoidingView>
          </SafeAreaView>
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
  safe: { flex: 1 },
  fill: { flex: 1 },
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  body: { flex: 1 },
});
