// Unit tests for the per-party ETA editor's pure helpers (issue #106).
import { adjustEta, isEtaDirty } from './etaMath';

describe('adjustEta', () => {
  const base = new Date('2026-04-29T18:00:00Z');

  it('positive delta pushes ETA later by the given minutes', () => {
    const next = adjustEta(base, 5);
    expect(next.toISOString()).toBe('2026-04-29T18:05:00.000Z');
  });

  it('negative delta pulls ETA earlier', () => {
    const next = adjustEta(base, -10);
    expect(next.toISOString()).toBe('2026-04-29T17:50:00.000Z');
  });

  it('zero delta returns the same instant (but a new Date object)', () => {
    const next = adjustEta(base, 0);
    expect(next.valueOf()).toBe(base.valueOf());
    expect(next).not.toBe(base);
  });

  it('+15 then -10 from the same base lands at +5', () => {
    // Verifies the chip-stack behavior in the editor.
    const after15 = adjustEta(base, 15);
    const after5 = adjustEta(after15, -10);
    expect(after5.toISOString()).toBe('2026-04-29T18:05:00.000Z');
  });

  it('Invalid Date in propagates as Invalid Date out', () => {
    const bad = new Date('not-a-date');
    const next = adjustEta(bad, 5);
    expect(Number.isNaN(next.valueOf())).toBe(true);
  });
});

describe('isEtaDirty', () => {
  const a = new Date('2026-04-29T18:00:00Z');
  const b = new Date('2026-04-29T18:05:00Z');
  const aClone = new Date(a.valueOf());

  it('returns true when instants differ', () => {
    expect(isEtaDirty(b, a)).toBe(true);
  });

  it('returns false when instants are identical (different Date instances)', () => {
    // Critical: prevents disabling Save when the user adjusted by +5 then -5.
    expect(isEtaDirty(aClone, a)).toBe(false);
  });

  it('returns false when draft is Invalid Date', () => {
    expect(isEtaDirty(new Date('bad'), a)).toBe(false);
  });

  it('returns false when original is Invalid Date', () => {
    expect(isEtaDirty(a, new Date('bad'))).toBe(false);
  });
});
