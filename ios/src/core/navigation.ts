import type { AppRole } from './auth';

export function destinationForRole(role: AppRole | null | undefined): '/(host)/workspace' | '/(host)/waiting' | '/(guest)/lobby' {
  if (role === 'guest') return '/(guest)/lobby';
  if (role === 'owner' || role === 'admin') return '/(host)/workspace';
  return '/(host)/waiting';
}
