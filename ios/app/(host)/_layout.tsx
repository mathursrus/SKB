import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuthStore } from '@/state/auth';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

const POLL_INTERVAL_MS = 15_000;

export default function HostLayout() {
  const status = useAuthStore((s) => s.status);
  const poll = useWaitlistStore((s) => s.poll);

  useEffect(() => {
    if (status !== 'loggedIn') return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function startLoop() {
      if (cancelled) return;
      void poll();
      timer = setInterval(() => {
        if (AppState.currentState === 'active') void poll();
      }, POLL_INTERVAL_MS);
    }

    function stopLoop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }

    startLoop();

    // Pause polling while the app is backgrounded \u2014 don't burn battery
    // or hammer the SKB gateway when the host has locked their tablet.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (timer === null) startLoop();
      } else {
        stopLoop();
      }
    });

    return () => {
      cancelled = true;
      stopLoop();
      sub.remove();
    };
  }, [status, poll]);

  if (status === 'unknown') return null;
  if (status !== 'loggedIn') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.line,
        },
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textMuted,
        headerStyle: { backgroundColor: theme.color.surface },
        headerTintColor: theme.color.text,
        headerTitleStyle: { color: theme.color.text },
      }}
    >
      <Tabs.Screen name="waiting" options={{ title: 'Waiting' }} />
      <Tabs.Screen name="seated" options={{ title: 'Seated' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
