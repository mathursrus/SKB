// ============================================================================
// SKB - Time / service-day utilities (America/Los_Angeles)
// ============================================================================

const TZ = 'America/Los_Angeles';

/**
 * Return the "service day" for a given instant, as a YYYY-MM-DD string in PT.
 * This is used to partition queue entries by operating day so EOD rollover is
 * a query filter rather than a destructive reset.
 */
export function serviceDay(at: Date = new Date()): string {
    // Intl.DateTimeFormat with en-CA yields YYYY-MM-DD reliably.
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return fmt.format(at);
}

/**
 * Current wall-clock in PT. Returned as a Date object (the underlying instant
 * is unchanged; callers should not use it as a UTC substitute).
 */
export function nowPT(): Date {
    return new Date();
}

/** Minutes between two dates (b - a), rounded down, never negative. */
export function minutesBetween(a: Date, b: Date): number {
    return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60_000));
}

/** Add whole minutes to a Date. */
export function addMinutes(d: Date, minutes: number): Date {
    return new Date(d.getTime() + minutes * 60_000);
}
