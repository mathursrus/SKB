// ============================================================================
// Regression test for the Issue #30 PIN 1234 → 404 bug.
//
// The iOS client used to build URLs like `${base}/r/${loc}${path}` which
// produced `/r/skb/host/login` — but the server mounts the host API at
// `/r/:loc/api/host/*`, so every host request returned 404 and the PIN
// screen bailed with a network error. Fix was to insert `/api` into the
// built URL.
//
// NOTE: EXPO_PUBLIC_* env vars are inlined at build time by the Expo babel
// plugin, so we can't override them at test runtime — we just validate the
// path structure that follows the `/r/:loc/` prefix.
// ============================================================================

import { ApiError, buildAdminUrl, buildUrl, request } from './client';

describe('buildUrl (Issue #30 PIN 404 regression)', () => {
  it('inserts /api after /r/:loc/ in the resulting URL', () => {
    const url = buildUrl('/host/login');
    expect(url).toMatch(/\/r\/[^/]+\/api\/host\/login$/);
  });

  it('handles paths without leading slash', () => {
    const url = buildUrl('host/queue');
    expect(url).toMatch(/\/r\/[^/]+\/api\/host\/queue$/);
  });

  it('preserves trailing query strings', () => {
    const url = buildUrl('/host/chat/templates?code=ABC');
    expect(url).toMatch(/\/api\/host\/chat\/templates\?code=ABC$/);
  });

  it('must NOT produce a /r/:loc/host/* path (that was the 404 bug)', () => {
    const url = buildUrl('/host/login');
    expect(url).not.toMatch(/\/r\/[^/]+\/host\//);
  });
});

describe('ApiError diagnostic body parsing (issue #93)', () => {
  // The server returns 503 with structured error bodies like
  //   { error: 'temporarily unavailable', code: 'db_throw', detail: '...' }
  // The client should prefer the more specific `code` over `error` so callers
  // can distinguish failure modes, and surface `detail` in the message in dev.
  // We exercise the parser via a fake fetch response.

  function makeErrorResponse(body: unknown, status = 503): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function originalFetch(): typeof fetch | undefined {
    return (global as unknown as { fetch?: typeof fetch }).fetch;
  }

  function setFetch(impl: typeof fetch | undefined): void {
    (global as unknown as { fetch?: typeof fetch }).fetch = impl as typeof fetch;
  }

  it('uses body.code (db_throw) over body.error (temporarily unavailable)', async () => {
    const saved = originalFetch();
    setFetch(((async () => makeErrorResponse({
      error: 'temporarily unavailable',
      code: 'db_throw',
      detail: 'connection reset',
    })) as unknown) as typeof fetch);
    try {
      await request<unknown>('/staff', { locationId: 'skb' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as InstanceType<typeof ApiError>;
      expect(apiErr.status).toBe(503);
      expect(apiErr.code).toBe('db_throw');
      expect(apiErr.message).toContain('connection reset');
    } finally {
      setFetch(saved);
    }
  });

  it('falls back to body.error when body.code is missing (legacy responses)', async () => {
    const saved = originalFetch();
    setFetch(((async () => makeErrorResponse({ error: 'unauthorized' }, 401)) as unknown) as typeof fetch);
    try {
      await request<unknown>('/staff', { locationId: 'skb' });
      throw new Error('should have thrown');
    } catch (err) {
      const apiErr = err as InstanceType<typeof ApiError>;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe('unauthorized');
    } finally {
      setFetch(saved);
    }
  });

  it('falls back to http_error when body has no code or error field', async () => {
    const saved = originalFetch();
    setFetch(((async () => makeErrorResponse({ message: 'something' }, 500)) as unknown) as typeof fetch);
    try {
      await request<unknown>('/staff', { locationId: 'skb' });
      throw new Error('should have thrown');
    } catch (err) {
      const apiErr = err as InstanceType<typeof ApiError>;
      expect(apiErr.code).toBe('http_error');
    } finally {
      setFetch(saved);
    }
  });
});

describe('buildAdminUrl (web admin deep links from iOS)', () => {
  it('produces /r/:loc/admin.html with no tab when none provided', () => {
    const url = buildAdminUrl('skb');
    expect(url).toMatch(/\/r\/skb\/admin\.html$/);
  });

  it('appends ?tab= when a tab is provided', () => {
    const url = buildAdminUrl('skb', 'staff');
    expect(url).toMatch(/\/r\/skb\/admin\.html\?tab=staff$/);
  });

  it('encodes the location id', () => {
    const url = buildAdminUrl('loc with space', 'menu');
    expect(url).toContain('/r/loc%20with%20space/admin.html?tab=menu');
  });

  it('encodes the tab', () => {
    const url = buildAdminUrl('skb', 'tab&with=evil');
    expect(url).toContain('?tab=tab%26with%3Devil');
  });

  it('uses admin.html (NOT bare /admin) so static-file routing serves it', () => {
    // Regression for the broken-deep-links bug — bare /admin doesn't resolve.
    const url = buildAdminUrl('skb', 'staff');
    expect(url).toContain('admin.html');
    expect(url).not.toMatch(/\/admin(?:[?#]|$)/);
  });
});
