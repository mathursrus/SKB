import { ApiError } from '@/net/client';

import { getStaffErrorMessage } from './staffErrors';

describe('getStaffErrorMessage', () => {
  it('prefers deliveryMessage for invite delivery failures', () => {
    const err = new ApiError(503, 'invite_email_unavailable', 'POST /staff/invite -> 503 invite_email_unavailable', {
      deliveryMessage: 'Invite created for host@example.com, but email delivery is unavailable right now.',
      error: 'invite email delivery unavailable',
    });

    expect(getStaffErrorMessage(err, 'fallback')).toBe(
      'Invite created for host@example.com, but email delivery is unavailable right now.',
    );
  });

  it('uses the server error message before diagnostic codes', () => {
    const err = new ApiError(400, 'email_invalid', 'POST /staff/invite -> 400 email_invalid', {
      error: 'email must be a valid email address',
    });

    expect(getStaffErrorMessage(err, 'fallback')).toBe('email must be a valid email address');
  });

  it('maps transport failures to plain language', () => {
    expect(getStaffErrorMessage(new ApiError(0, 'network', 'network exploded'), 'fallback'))
      .toBe('Network error. Please try again.');
    expect(getStaffErrorMessage(new ApiError(0, 'timeout', 'timed out'), 'fallback'))
      .toBe('Request timed out. Please try again.');
  });
});
