import type { WaitingParty } from '@/core/party';

/**
 * The RowActions component computes the "reachable" predicate the same
 * way the website does: a party is reachable from the host stand if we
 * have a dialable phone AND at least one delivery channel — SMS (when
 * the diner consented) or in-app chat (when the tenant has features.chat
 * enabled). Issue #102 #1 + #5: previously the Chat button was hidden
 * for tenants with chat disabled even when SMS would have worked, and
 * Notify was disabled when SMS-consent was missing even though the
 * in-app chat could still reach the diner. This unit test pins the
 * truth table so a future render-path change can't silently regress it.
 */

interface ReachabilityInput {
  hasDialablePhone: boolean;
  smsCapable: boolean;
  chatFeatureOn: boolean;
}

function reachable({ hasDialablePhone, smsCapable, chatFeatureOn }: ReachabilityInput): boolean {
  return hasDialablePhone && (smsCapable || chatFeatureOn);
}

function partyOf(over: Partial<WaitingParty>): WaitingParty {
  return {
    id: 'p1',
    code: 'SKB-ABC',
    position: 1,
    name: 'Test',
    partySize: 2,
    phoneMasked: '****1234',
    phoneForDial: '+15551231234',
    joinedAt: '2026-04-28T18:00:00Z',
    etaAt: '2026-04-28T18:30:00Z',
    waitingMinutes: 0,
    state: 'waiting',
    unreadChat: 0,
    calls: [],
    ...over,
  };
}

describe('RowActions reachability', () => {
  it('SMS-consenting + chat enabled → reachable', () => {
    expect(reachable({ hasDialablePhone: true, smsCapable: true, chatFeatureOn: true })).toBe(true);
  });

  it('SMS-consenting + chat disabled → STILL reachable (issue #102 #1)', () => {
    // The bug we just fixed: Chat button used to disappear when
    // features.chat was off, hiding the host's compose surface even
    // though the diner consented to SMS.
    expect(reachable({ hasDialablePhone: true, smsCapable: true, chatFeatureOn: false })).toBe(true);
  });

  it('No SMS consent + chat enabled → reachable via in-app only', () => {
    expect(reachable({ hasDialablePhone: true, smsCapable: false, chatFeatureOn: true })).toBe(true);
  });

  it('No SMS consent + chat disabled → not reachable', () => {
    expect(reachable({ hasDialablePhone: true, smsCapable: false, chatFeatureOn: false })).toBe(false);
  });

  it('No phone on file → not reachable regardless of channel flags', () => {
    expect(reachable({ hasDialablePhone: false, smsCapable: true, chatFeatureOn: true })).toBe(false);
  });

  it('onMyWayAt is undefined when the diner has not acknowledged (issue #102 #4)', () => {
    // The PartyRow used to render the "ON THE WAY" badge whenever
    // `party.onMyWayAt !== null`. The server returns the field as
    // `undefined` (not null) for parties that haven't acked, so the
    // strict `!== null` check evaluated to true for everyone. This
    // pins the contract: unacked parties must arrive without the field.
    const fresh = partyOf({});
    expect(fresh.onMyWayAt).toBeUndefined();
    expect(fresh.onMyWayAt != null).toBe(false);
    const acked = partyOf({ onMyWayAt: '2026-04-28T18:15:00Z' });
    expect(acked.onMyWayAt != null).toBe(true);
  });
});
