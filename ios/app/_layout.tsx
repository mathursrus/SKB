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
  const theme = useTheme();
  const scheme = useColorScheme();
  const [updateChecked, setUpdateChecked] = useState(false);

  // Proactively fetch + apply any pending OTA update BEFORE the app renders
  // its first real screen. Default expo-updates behavior is "serve cached,
  // download in background, apply on next launch" — which traps users on
  // stale bundles through a full launch cycle. Awaiting here means: first
  // launch after a push downloads AND applies, no double-relaunch ritual.
  useEffect(() => {
    (async () => {
      try {
        if (!Updates.isEnabled) { setUpdateChecked(true); return; }
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
          return; // app restarts here with the new bundle
        }
      } catch {
        // Network failure / dev client: fall through to boot with current bundle
      }
      setUpdateChecked(true);
    })();
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    void (async () => {
      const result = await registerForPushNotifications();
      if (result.token) {
        await registerPushTokenWithBackend(result.token);
      }
      dispose = addUnreadBadgeListener();
    })();
    return () => {
      dispose?.();
    };
  }, []);

  // Hold the UI on a blank surface while we settle the OTA check. Max ~3s
  // (Expo's default network timeout) so even if the Expo manifest is down
  // the app still boots.
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
          <Stack.Screen name="login" options={{ title: 'SKB · Host Stand', headerShown: false }} />
          <Stack.Screen name="(host)" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
