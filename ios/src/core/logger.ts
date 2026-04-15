type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: Level;
  msg: string;
  t: string;
  data?: Record<string, unknown>;
}

type Sink = (event: LogEvent) => void;

const sinks = new Set<Sink>();

function emit(level: Level, msg: string, data?: Record<string, unknown>): void {
  const event: LogEvent = { level, msg, t: new Date().toISOString(), data };
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // never let a failing sink crash the caller
    }
  }
  const line = JSON.stringify(event);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => emit('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
  addSink: (sink: Sink) => {
    sinks.add(sink);
    return () => sinks.delete(sink);
  },
};

/**
 * Event names used for product analytics. Keeping them in one place so they
 * don't drift across features and so a future Sentry/Amplitude/PostHog sink
 * can find them via search.
 */
export const events = {
  authLoginAttempt: 'auth.login.attempt',
  authLoginSuccess: 'auth.login.success',
  authLoginFailure: 'auth.login.failure',
  authLogout: 'auth.logout',
  waitlistPoll: 'waitlist.poll',
  waitlistPollError: 'waitlist.poll.error',
  seatOpen: 'seat.dialog.open',
  seatConfirm: 'seat.confirm',
  seatConflictOverride: 'seat.conflict.override',
  chatOpen: 'chat.open',
  chatSend: 'chat.send',
  callInitiate: 'call.initiate',
} as const;
