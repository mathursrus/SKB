// Pure-logic helpers for the per-party ETA editor (issue #106).
// Extracted so they can be unit-tested without a React Native renderer.

/**
 * Apply a minute delta to an existing ETA. Returns a fresh Date.
 * Negative deltas pull the ETA earlier; positive ones push it later.
 * Invalid current dates propagate as Invalid Date.
 */
export function adjustEta(current: Date, deltaMinutes: number): Date {
  return new Date(current.valueOf() + deltaMinutes * 60_000);
}

/**
 * True iff `draft` and `original` are both valid Dates AND they represent
 * different instants. Used to enable/disable the Save button so a no-op
 * edit can't accidentally hit the API.
 */
export function isEtaDirty(draft: Date, original: Date): boolean {
  if (Number.isNaN(draft.valueOf())) return false;
  if (Number.isNaN(original.valueOf())) return false;
  return draft.valueOf() !== original.valueOf();
}
