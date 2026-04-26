import type {
  DayHours,
  DayOfWeek,
  ServiceWindowKey,
  WeeklyHours,
} from '@/net/endpoints';

export const DAYS: ReadonlyArray<{ key: DayOfWeek; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

export const SERVICE_WINDOWS: ReadonlyArray<{ key: ServiceWindowKey; label: string }> = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'special', label: 'Special' },
  { key: 'dinner', label: 'Dinner' },
];

const WINDOW_DEFAULTS: Record<ServiceWindowKey, { open: string; close: string }> = {
  breakfast: { open: '08:00', close: '10:30' },
  lunch: { open: '11:30', close: '14:30' },
  special: { open: '15:00', close: '17:00' },
  dinner: { open: '17:30', close: '21:30' },
};

export function dayLabel(day: DayOfWeek): string {
  return DAYS.find((d) => d.key === day)?.label ?? day;
}

/**
 * Format raw input into HH:MM as the user types. Strips non-digits, caps at 4
 * digits, then inserts ':' after the first 2. Empty string → empty string.
 */
export function sanitizeTime(input: string): string {
  const digits = input.replace(/[^\d]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * Mark a day as closed or, when re-opening, seed it with reasonable defaults
 * (lunch + dinner). Avoids dropping the user into an empty day with no fields.
 */
export function setDayClosed(
  prev: WeeklyHours,
  day: DayOfWeek,
  closed: boolean,
): WeeklyHours {
  const next: WeeklyHours = { ...prev };
  next[day] = closed
    ? 'closed'
    : {
        lunch: { ...WINDOW_DEFAULTS.lunch },
        dinner: { ...WINDOW_DEFAULTS.dinner },
      };
  return next;
}

/**
 * Update one edge (open or close) of one service window.
 */
export function setWindowTime(
  prev: WeeklyHours,
  day: DayOfWeek,
  service: ServiceWindowKey,
  edge: 'open' | 'close',
  value: string,
): WeeklyHours {
  const entry = prev[day];
  const dayHours: DayHours = entry === 'closed' || !entry ? {} : { ...entry };
  const window = dayHours[service] ?? { open: '', close: '' };
  dayHours[service] = { ...window, [edge]: value };
  return { ...prev, [day]: dayHours };
}

/**
 * Add or remove a named service window for a given day. Adding seeds
 * sensible defaults; removing deletes the key entirely.
 */
export function toggleWindow(
  prev: WeeklyHours,
  day: DayOfWeek,
  service: ServiceWindowKey,
  enabled: boolean,
): WeeklyHours {
  const entry = prev[day];
  const dayHours: DayHours = entry === 'closed' || !entry ? {} : { ...entry };
  if (enabled) {
    dayHours[service] = { ...WINDOW_DEFAULTS[service] };
  } else {
    delete dayHours[service];
  }
  return { ...prev, [day]: dayHours };
}

/**
 * Replicate one day's hours across all 7 days. Used by the "Copy to all" button
 * to skip tedious per-day repetition. Deep-copies the service windows so each
 * day owns its own objects — otherwise editing Tuesday's lunch open time would
 * silently mutate every other day's lunch.
 */
export function copyDayToAll(prev: WeeklyHours, sourceDay: DayOfWeek): WeeklyHours {
  const source = prev[sourceDay];
  const next: WeeklyHours = {};
  for (const { key } of DAYS) {
    if (source === 'closed' || !source) {
      next[key] = 'closed';
    } else {
      next[key] = cloneDayHours(source);
    }
  }
  return next;
}

function cloneDayHours(d: DayHours): DayHours {
  const out: DayHours = {};
  if (d.breakfast) out.breakfast = { ...d.breakfast };
  if (d.lunch) out.lunch = { ...d.lunch };
  if (d.special) out.special = { ...d.special };
  if (d.dinner) out.dinner = { ...d.dinner };
  return out;
}

export function hasNonEmptyAddress(a: { street: string; city: string; state: string; zip: string }): boolean {
  return Boolean(a.street.trim() || a.city.trim() || a.state.trim() || a.zip.trim());
}
