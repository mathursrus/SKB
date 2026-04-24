import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  addUnreadBadgeListener,
  registerForPushNotifications,
  registerPushTokenWithBackend,
} from '@/net/push';
import { useAuthStore } from '@/state/auth';
import { useTheme } from '@/ui/theme';

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const locationId = useAuthStore((s) => s.locationId);
  const theme = useTheme();
  const scheme = useColorScheme();
  const [updateChecked, setUpdateChecked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!Updates.isEnabled) { setUpdateChecked(true); return; }
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return;
        }
      } catch {
        // Best effort only.
      }
      setUpdateChecked(true);
    })();
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (status !== 'loggedIn' || role === 'guest' || !locationId) return undefined;

    let dispose: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const result = await registerForPushNotifications();
      if (!cancelled && result.token) {
        await registerPushTokenWithBackend(result.token, locationId);
      }
      if (!cancelled) {
        dispose = addUnreadBadgeListener();
      }
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [locationId, role, status]);

  if (!updateChecked) {
    return <View style={{ flex: 1, backgroundColor: theme.color.surface }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.color.surface }}>
      <SafeAreaProvider>
        <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.color.surface },
            headerTintColor: theme.color.text,
            contentStyle: { backgroundColor: theme.color.surface },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: 'OSH', headerShown: false }} />
          <Stack.Screen name="(host)" options={{ headerShown: false }} />
          <Stack.Screen name="(guest)" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
