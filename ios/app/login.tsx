import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
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

      <BuildInfo />
    </SafeAreaView>
  );
}

// Small diagnostic strip at the bottom of the login card so we can see, on
// the actual device, which bundle is loaded — catches the "OTA didn't land"
// class of bug we hit with the /api buildUrl fix.
function BuildInfo() {
  const apiBase =
    (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl
    ?? (process.env as { EXPO_PUBLIC_API_BASE_URL?: string }).EXPO_PUBLIC_API_BASE_URL
    ?? '(default)';
  const updateId = Updates.updateId ?? 'embedded';
  const shortId = updateId === 'embedded' ? 'embedded' : updateId.slice(0, 8);
  const channel = Updates.channel ?? '—';
  // Host shown is just the hostname portion; keeps the strip short.
  let host = apiBase;
  try { host = new URL(apiBase).host; } catch { /* ignore */ }
  return (
    <Text style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#8a8a8a' }}>
      build · {channel} · {shortId} · {host}
    </Text>
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
