import { Redirect } from 'expo-router';

import { useAuthStore } from '@/state/auth';

export default function Index() {
  const status = useAuthStore((s) => s.status);
  if (status === 'unknown') return null;
  if (status === 'loggedIn') return <Redirect href="/(host)/waiting" />;
  return <Redirect href="/login" />;
}
