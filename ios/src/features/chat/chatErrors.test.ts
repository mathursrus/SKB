import { ApiError } from '@/net/client';

import { getChatErrorMessage } from './chatErrors';

describe('getChatErrorMessage', () => {
  it('translates the legacy chat.disabled code into actionable copy', () => {
    // Pre-decoupling, the host's send hit a 403 with code "chat.disabled"
    // and the raw message leaked into the UI ("POST .../chat -> 403
    // chat.disabled"). This is the friendly mapping that should appear
    // even if a stale server still surfaces the code.
    const err = new ApiError(
      403,
      'chat.disabled',
      'POST /host/queue/abc/chat -> 403 chat.disabled',
    );
    expect(getChatErrorMessage(err)).toBe(
      'Messaging is temporarily unavailable for this restaurant. Try again or call them instead.',
    );
  });

  it('maps network and timeout failures to plain language', () => {
    expect(getChatErrorMessage(new ApiError(0, 'network', 'fetch failed'))).toBe(
      'No connection. Check your network and try again.',
    );
    expect(getChatErrorMessage(new ApiError(0, 'timeout', 'aborted'))).toBe(
      'The server took too long to respond. Try again.',
    );
  });

  it('maps auth and not-found responses', () => {
    expect(getChatErrorMessage(new ApiError(401, 'unauthorized', '...'))).toBe(
      'You were signed out. Sign in again to send messages.',
    );
    expect(getChatErrorMessage(new ApiError(404, 'not_found', '...'))).toBe(
      'This party is no longer on the waitlist.',
    );
    expect(getChatErrorMessage(new ApiError(429, 'rate_limited', '...'))).toBe(
      'Slow down — too many messages too quickly. Try again in a moment.',
    );
    expect(getChatErrorMessage(new ApiError(500, 'db_throw', '...'))).toBe(
      'The server hit an error. Try again in a moment.',
    );
  });

  it('falls back to a generic message when the error is unknown', () => {
    expect(getChatErrorMessage(new Error('something exploded'))).toBe(
      'Couldn’t send the message. Try again.',
    );
    expect(getChatErrorMessage(undefined)).toBe('Couldn’t send the message. Try again.');
  });

  it('never returns the raw http_error code as the message', () => {
    const err = new ApiError(418, 'http_error', 'I am a teapot');
    expect(getChatErrorMessage(err)).not.toContain('http_error');
  });
});
