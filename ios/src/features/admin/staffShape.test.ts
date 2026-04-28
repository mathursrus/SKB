import type { PendingInvite, StaffMember } from '@/net/endpoints';

/**
 * Issue #102 #6 regression guard. The server's /staff endpoint returns
 * StaffRow.membershipId and PublicInvite.id (see src/services/invites.ts
 * + src/types/identity.ts). The iOS interface previously declared `_id`
 * for both, so `member._id` was undefined at runtime — the Remove
 * button silently sent `{membershipId: undefined}` to /staff/revoke and
 * the server 400'd. This test pins the iOS contract to the server's
 * actual field names, so a future "let me restore the _id field"
 * refactor fails the type check + this assertion.
 */
describe('Staff field-name contract', () => {
  it('StaffMember exposes membershipId — never _id', () => {
    const member: StaffMember = {
      membershipId: 'mem-1',
      userId: 'usr-1',
      role: 'host',
    };
    // This is what StaffSection.tsx calls when the host taps Remove.
    expect(member.membershipId).toBe('mem-1');
    // Spot-check that the property doesn't exist under the legacy name.
    expect((member as unknown as { _id?: string })._id).toBeUndefined();
  });

  it('PendingInvite exposes id — never _id', () => {
    const invite: PendingInvite = {
      id: 'inv-1',
      email: 't@example.com',
      role: 'host',
      locationId: 'skb',
    };
    expect(invite.id).toBe('inv-1');
    expect((invite as unknown as { _id?: string })._id).toBeUndefined();
  });
});
