import { useEffect, useState } from 'react';

type Listener = (now: number) => void;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function tick() {
  const now = Date.now();
  for (const l of listeners) l(now);
}

function ensureInterval() {
  if (intervalHandle !== null) return;
  intervalHandle = setInterval(tick, 1000);
}

function maybeStopInterval() {
  if (listeners.size === 0 && intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

/**
 * useSharedClockTick
 *
 * Returns the current wall-clock time in ms, updated once per second by a
 * single setInterval that is shared across every consumer. Replacing the
 * previous per-row setInterval avoids the N-timer problem when the Waiting
 * list has 20+ parties.
 */
export function useSharedClockTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    listeners.add(setNow);
    ensureInterval();
    return () => {
      listeners.delete(setNow);
      maybeStopInterval();
    };
  }, []);
  return now;
}
