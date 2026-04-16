import { Text, type TextStyle } from 'react-native';

import { useSharedClockTick } from '@/core/clock';
import { formatWaitingMinutes } from '@/core/waitlist';

interface Props {
  /** ISO timestamp when the party joined — used to compute a live-ticking minute count. */
  joinedAt: string;
  /** Server-reported minutes at last poll — used as the initial offset. */
  baseMinutes: number;
  /** Timestamp (ms) when baseMinutes was captured. */
  baseAt: number;
  style?: TextStyle;
}

/**
 * Renders a live-ticking waiting duration. The server sends integer minutes on
 * every poll; between polls we interpolate forward from the joinedAt ISO so the
 * number updates once per minute rather than staying stuck for 15 seconds.
 */
export function LiveClock({ joinedAt, baseMinutes, baseAt, style }: Props) {
  const now = useSharedClockTick();
  const joinedMs = Date.parse(joinedAt);
  let minutes = baseMinutes;
  if (Number.isFinite(joinedMs)) {
    // Prefer a fresh computation from joinedAt so the UI ticks forward between
    // server polls. Fall back to baseMinutes if joinedAt is bogus.
    minutes = Math.max(0, Math.floor((now - joinedMs) / 60_000));
  } else {
    // Degrade gracefully: advance baseMinutes by elapsed time since last poll.
    const elapsed = Math.max(0, now - baseAt);
    minutes = baseMinutes + Math.floor(elapsed / 60_000);
  }
  return <Text style={style}>{formatWaitingMinutes(minutes)}</Text>;
}
