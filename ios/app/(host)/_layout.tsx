import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { isAdminRole, isStaffRole } from '@/core/auth';
import { useAuthStore } from '@/state/auth';
import { useWaitlistStore } from '@/state/waitlist';
import { theme } from '@/ui/theme';

const POLL_INTERVAL_MS = 15_000;

export default function HostLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const brand = useAuthStore((s) => s.brand);
  const poll = useWaitlistStore((s) => s.poll);
  const reset = useWaitlistStore((s) => s.reset);

  useEffect(() => {
    if (status !== 'loggedIn' || !isStaffRole(role)) return undefined;

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
      reset();
    };
  }, [poll, reset, role, status]);

  if (status === 'unknown') return null;
  if (status !== 'loggedIn' || !isStaffRole(role)) return <Redirect href="/login" />;

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
        headerTitleStyle: { color: theme.color.text, fontWeight: '700' },
        headerTitle: brand?.restaurantName ?? 'OSH',
      }}
    >
      {isAdminRole(role) && (
        <Tabs.Screen
          name="workspace"
          options={{
            title: 'Workspace',
            tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
          }}
        />
      )}
      <Tabs.Screen
        name="waiting"
        options={{
          title: 'Waiting',
          tabBarIcon: ({ color, size }) => <Ionicons name="hourglass-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="seated"
        options={{
          title: 'Seated',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="complete"
        options={{
          title: 'Complete',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
