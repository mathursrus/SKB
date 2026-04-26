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

import { buildAdminUrl, buildUrl } from './client';

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
