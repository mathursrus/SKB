import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/state/auth';
import { useTheme, type Theme } from '@/ui/theme';

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  useEffect(() => {
    if (status === 'loggedIn') router.replace('/(host)/waiting');
  }, [status]);

  const disabled = pin.length < 4 || status === 'loggingIn';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>SKB · Host Stand</Text>
      <Text style={styles.subtitle}>Enter host PIN to continue</Text>

      <TextInput
        accessibilityLabel="Host PIN"
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="••••"
        placeholderTextColor={theme.color.textMuted}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={() => !disabled && void login(pin)}
      />

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign in"
        style={[styles.button, disabled && styles.buttonDisabled]}
        disabled={disabled}
        onPress={() => void login(pin)}
      >
        <Text style={styles.buttonText}>
          {status === 'loggingIn' ? 'Signing in…' : 'Sign in'}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.color.surface,
      justifyContent: 'center',
      paddingHorizontal: theme.space.xl,
    },
    title: {
      color: theme.color.text,
      fontSize: 28,
      fontWeight: '600',
      textAlign: 'center',
    },
    subtitle: {
      color: theme.color.textMuted,
      fontSize: 16,
      textAlign: 'center',
      marginTop: theme.space.sm,
      marginBottom: theme.space.xl,
    },
    input: {
      backgroundColor: theme.color.surfaceRaised,
      color: theme.color.text,
      borderWidth: 1,
      borderColor: theme.color.line,
      borderRadius: theme.radius.md,
      padding: theme.space.lg,
      fontSize: 24,
      textAlign: 'center',
      letterSpacing: 8,
      fontVariant: ['tabular-nums'],
    },
    error: {
      color: theme.color.warn,
      marginTop: theme.space.md,
      textAlign: 'center',
    },
    button: {
      marginTop: theme.space.xl,
      backgroundColor: theme.color.accent,
      paddingVertical: theme.space.lg,
      borderRadius: theme.radius.md,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: theme.color.accentFg,
      fontSize: 18,
      fontWeight: '600',
    },
  });
}
