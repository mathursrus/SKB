import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  addUnreadBadgeListener,
  registerForPushNotifications,
  registerPushTokenWithBackend,
} from '@/net/push';
import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);

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

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.color.surface }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
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
