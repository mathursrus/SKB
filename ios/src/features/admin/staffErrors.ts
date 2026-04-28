import { ApiError } from '@/net/client';

type ErrorBody = {
  error?: unknown;
  deliveryMessage?: unknown;
};

export function getStaffErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = (err.body && typeof err.body === 'object') ? (err.body as ErrorBody) : null;
    if (body && typeof body.deliveryMessage === 'string' && body.deliveryMessage.trim().length > 0) {
      return body.deliveryMessage;
    }
    if (body && typeof body.error === 'string' && body.error.trim().length > 0) {
      return body.error;
    }
    if (err.code === 'network') return 'Network error. Please try again.';
    if (err.code === 'timeout') return 'Request timed out. Please try again.';
  }
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  return fallback;
}
