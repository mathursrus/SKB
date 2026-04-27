import {
  copyDayToAll,
  hasNonEmptyAddress,
  sanitizeTime,
  setDayClosed,
  setWindowTime,
  toggleWindow,
} from './hoursLogic';

describe('sanitizeTime', () => {
  it('returns empty for empty input', () => {
    expect(sanitizeTime('')).toBe('');
  });

  it('strips non-digits', () => {
    expect(sanitizeTime('abc')).toBe('');
    expect(sanitizeTime('1a2b')).toBe('12');
  });

  it('returns digits as-is when 2 or fewer', () => {
    expect(sanitizeTime('1')).toBe('1');
    expect(sanitizeTime('12')).toBe('12');
  });

  it('inserts colon after 2 digits', () => {
    expect(sanitizeTime('123')).toBe('12:3');
    expect(sanitizeTime('1230')).toBe('12:30');
  });

  it('caps at 4 digits (truncates excess)', () => {
    expect(sanitizeTime('12345')).toBe('12:34');
    expect(sanitizeTime('123456789')).toBe('12:34');
  });

  it('handles already-formatted input', () => {
    expect(sanitizeTime('11:30')).toBe('11:30');
    expect(sanitizeTime('17:00')).toBe('17:00');
  });
});

describe('setDayClosed', () => {
  it('marks a day closed', () => {
    const next = setDayClosed({}, 'mon', true);
    expect(next.mon).toBe('closed');
  });

  it('seeds lunch + dinner defaults when reopening', () => {
    const next = setDayClosed({ mon: 'closed' }, 'mon', false);
    expect(next.mon).toEqual({
      lunch: { open: '11:30', close: '14:30' },
      dinner: { open: '17:30', close: '21:30' },
    });
  });

  it('does not mutate other days', () => {
    const prev = { tue: 'closed' as const };
    const next = setDayClosed(prev, 'mon', true);
    expect(next.tue).toBe('closed');
  });

  it('does not mutate input by reference', () => {
    const prev = { mon: 'closed' as const };
    setDayClosed(prev, 'mon', false);
    expect(prev.mon).toBe('closed');
  });
});

describe('setWindowTime', () => {
  it('sets open time on a fresh day', () => {
    const next = setWindowTime({}, 'wed', 'lunch', 'open', '11:00');
    expect(next.wed).toEqual({ lunch: { open: '11:00', close: '' } });
  });

  it('preserves the other edge when setting one', () => {
    const prev = { wed: { lunch: { open: '11:00', close: '14:00' } } };
    const next = setWindowTime(prev, 'wed', 'lunch', 'close', '15:00');
    expect(next.wed).toEqual({ lunch: { open: '11:00', close: '15:00' } });
  });

  it('treats a closed day as starting fresh', () => {
    const prev = { wed: 'closed' as const };
    const next = setWindowTime(prev, 'wed', 'dinner', 'open', '17:30');
    expect(next.wed).toEqual({ dinner: { open: '17:30', close: '' } });
  });
});

describe('toggleWindow', () => {
  it('adds defaults when enabling', () => {
    const next = toggleWindow({}, 'fri', 'breakfast', true);
    expect(next.fri).toEqual({ breakfast: { open: '08:00', close: '10:30' } });
  });

  it('removes the window when disabling', () => {
    const prev = {
      fri: { breakfast: { open: '08:00', close: '10:30' }, lunch: { open: '11:30', close: '14:30' } },
    };
    const next = toggleWindow(prev, 'fri', 'breakfast', false);
    expect(next.fri).toEqual({ lunch: { open: '11:30', close: '14:30' } });
  });

  it('treats a closed day as empty when enabling a window', () => {
    const next = toggleWindow({ fri: 'closed' }, 'fri', 'lunch', true);
    expect(next.fri).toEqual({ lunch: { open: '11:30', close: '14:30' } });
  });
});

describe('copyDayToAll', () => {
  it('copies an open day to all other days', () => {
    const prev = { mon: { dinner: { open: '17:00', close: '21:00' } } };
    const next = copyDayToAll(prev, 'mon');
    expect(next.mon).toEqual({ dinner: { open: '17:00', close: '21:00' } });
    expect(next.tue).toEqual({ dinner: { open: '17:00', close: '21:00' } });
    expect(next.sun).toEqual({ dinner: { open: '17:00', close: '21:00' } });
  });

  it('copies a closed day to all', () => {
    const prev = { mon: 'closed' as const, fri: { lunch: { open: '11:00', close: '14:00' } } };
    const next = copyDayToAll(prev, 'mon');
    expect(next.tue).toBe('closed');
    expect(next.fri).toBe('closed');
  });

  it('copies undefined as closed (treats missing day as closed)', () => {
    const next = copyDayToAll({}, 'mon');
    expect(next.tue).toBe('closed');
  });

  it('produces independent objects so future edits do not leak', () => {
    const prev = { mon: { dinner: { open: '17:00', close: '21:00' } } };
    const next = copyDayToAll(prev, 'mon');
    // Mutating next.tue.dinner should NOT affect next.wed.dinner.
    if (typeof next.tue !== 'string' && next.tue?.dinner) {
      next.tue.dinner.open = '18:00';
    }
    if (typeof next.wed !== 'string' && next.wed?.dinner) {
      expect(next.wed.dinner.open).toBe('17:00');
    }
  });
});

describe('hasNonEmptyAddress', () => {
  it('returns false for all-empty', () => {
    expect(hasNonEmptyAddress({ street: '', city: '', state: '', zip: '' })).toBe(false);
  });

  it('returns false for whitespace-only', () => {
    expect(hasNonEmptyAddress({ street: '  ', city: ' ', state: '', zip: '   ' })).toBe(false);
  });

  it('returns true if any field has content', () => {
    expect(hasNonEmptyAddress({ street: '12 Main', city: '', state: '', zip: '' })).toBe(true);
    expect(hasNonEmptyAddress({ street: '', city: '', state: 'WA', zip: '' })).toBe(true);
    expect(hasNonEmptyAddress({ street: '', city: '', state: '', zip: '98004' })).toBe(true);
  });
});
