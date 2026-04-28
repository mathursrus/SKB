import { ApiError } from '@/net/client';

/**
 * Translate raw network / API errors from the chat endpoints into copy a
 * host can act on. Issue #102 #2 — error messages like
 * "POST /host/queue/abc/chat -> 403 chat.disabled" leaked the wire shape
 * straight into the UI; this helper hides that.
 *
 * The server-side fix (decoupling features.chat from host SMS) means the
 * `chat.disabled` code shouldn't fire on the host side anymore — but we
 * still translate it defensively in case the deploy lags or a future
 * regression reintroduces the gate.
 */
export function getChatErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'network') return 'No connection. Check your network and try again.';
    if (err.code === 'timeout') return 'The server took too long to respond. Try again.';
    if (err.code === 'chat.disabled') {
      return 'Messaging is temporarily unavailable for this restaurant. Try again or call them instead.';
    }
    if (err.status === 401) return 'You were signed out. Sign in again to send messages.';
    if (err.status === 403) return 'You don’t have permission to send this message.';
    if (err.status === 404) return 'This party is no longer on the waitlist.';
    if (err.status === 429) return 'Slow down — too many messages too quickly. Try again in a moment.';
    if (err.status >= 500) return 'The server hit an error. Try again in a moment.';
    if (typeof err.code === 'string' && err.code.length > 0 && err.code !== 'http_error') {
      return `Couldn’t send: ${humanize(err.code)}`;
    }
  }
  return 'Couldn’t send the message. Try again.';
}

function humanize(code: string): string {
  return code.replace(/[._-]/g, ' ').replace(/^\w/, (c) => c.toLowerCase());
}
