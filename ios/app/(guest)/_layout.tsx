import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '@/state/auth';
import { theme } from '@/ui/theme';

export default function GuestLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const brand = useAuthStore((s) => s.brand);

  if (status === 'unknown') return null;
  if (status !== 'loggedIn' || role !== 'guest') return <Redirect href="/login" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.surface },
        headerTintColor: theme.color.text,
        contentStyle: { backgroundColor: theme.color.surface },
      }}
    >
      <Stack.Screen
        name="lobby"
        options={{
          title: brand?.restaurantName ?? 'Guest view',
        }}
      />
    </Stack>
  );
}
