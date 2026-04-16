import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

export default function SettingsScreen() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Settings</Text>
      <Text style={styles.placeholder}>
        ETA mode + avg turn-time controls land in Phase 3.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={styles.logoutButton}
        onPress={() => void logout()}
      >
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.surface,
    padding: theme.space.lg,
  },
  header: {
    color: theme.color.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: theme.space.md,
  },
  placeholder: {
    color: theme.color.textMuted,
    fontSize: 14,
    marginBottom: theme.space.xxl,
  },
  logoutButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.color.warn,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
  },
  logoutText: {
    color: theme.color.warn,
    fontSize: 16,
    fontWeight: '600',
  },
});
