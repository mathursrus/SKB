import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({ visible, title, onClose, children, footer }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          style={styles.modal}
          accessibilityRole="alert"
          accessibilityLabel={title}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={16}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          {children}
          {footer !== undefined && <View style={styles.footer}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  closeText: {
    color: theme.color.textMuted,
    fontSize: 26,
    lineHeight: 26,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.space.md,
    padding: theme.space.lg,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
  },
});
