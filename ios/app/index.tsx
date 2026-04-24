import { Redirect } from 'expo-router';

import { destinationForRole } from '@/core/navigation';
import { useAuthStore } from '@/state/auth';

export default function Index() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);

  if (status === 'unknown') return null;
  if (status === 'loggedIn') return <Redirect href={destinationForRole(role)} />;
  return <Redirect href="/login" />;
}
