import type { SeatedParty } from './party';
import { canConfirm, confirmLabel, validateSeatInput } from './seatValidation';

function mkSeated(over: Partial<SeatedParty> & Pick<SeatedParty, 'id' | 'tableNumber' | 'name'>): SeatedParty {
  const base: SeatedParty = {
    id: over.id,
    name: over.name,
    partySize: 2,
    phoneMasked: '******1234',
    tableNumber: over.tableNumber,
    state: 'seated',
    seatedAt: '2026-04-14T19:00:00Z',
    timeInStateMinutes: 10,
    totalTableMinutes: 10,
    waitMinutes: 15,
    toOrderMinutes: null,
    toServeMinutes: null,
    toCheckoutMinutes: null,
  };
  return { ...base, ...over };
}

describe('validateSeatInput', () => {
  const seated: SeatedParty[] = [
    mkSeated({ id: 'kim', tableNumber: 12, name: 'Kim, Jae' }),
    mkSeated({ id: 'nguyen', tableNumber: 14, name: 'Nguyen, Thao', state: 'served' }),
  ];

  test('empty', () => {
    expect(validateSeatInput({ raw: '', seated })).toEqual({ kind: 'empty' });
    expect(validateSeatInput({ raw: '   ', seated })).toEqual({ kind: 'empty' });
  });

  test('non-numeric', () => {
    expect(validateSeatInput({ raw: 'abc', seated })).toEqual({
      kind: 'invalid',
      reason: 'not_numeric',
    });
    expect(validateSeatInput({ raw: '12a', seated })).toEqual({
      kind: 'invalid',
      reason: 'not_numeric',
    });
  });

  test('out of range', () => {
    expect(validateSeatInput({ raw: '0', seated })).toEqual({
      kind: 'invalid',
      reason: 'out_of_range',
    });
    expect(validateSeatInput({ raw: '1000', seated })).toEqual({
      kind: 'invalid',
      reason: 'out_of_range',
    });
  });

  test('valid unoccupied table', () => {
    expect(validateSeatInput({ raw: '5', seated })).toEqual({
      kind: 'valid',
      tableNumber: 5,
    });
    expect(validateSeatInput({ raw: '999', seated })).toEqual({
      kind: 'valid',
      tableNumber: 999,
    });
  });

  test('conflict returns occupying party name', () => {
    const result = validateSeatInput({ raw: '12', seated });
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.tableNumber).toBe(12);
      expect(result.byPartyName).toBe('Kim, Jae');
    }
  });

  test('excluded party suppresses self-conflict', () => {
    expect(validateSeatInput({ raw: '12', seated, excludePartyId: 'kim' })).toEqual({
      kind: 'valid',
      tableNumber: 12,
    });
  });
});

describe('confirmLabel + canConfirm', () => {
  test('empty/invalid show em-dash label and cannot confirm', () => {
    expect(confirmLabel({ kind: 'empty' })).toBe('Seat at table —');
    expect(canConfirm({ kind: 'empty' }, false)).toBe(false);
    expect(canConfirm({ kind: 'invalid', reason: 'not_numeric' }, true)).toBe(false);
  });

  test('valid state is always confirmable', () => {
    const s = { kind: 'valid', tableNumber: 8 } as const;
    expect(confirmLabel(s)).toBe('Seat at table 8');
    expect(canConfirm(s, false)).toBe(true);
  });

  test('conflict only confirmable with override armed', () => {
    const s = { kind: 'conflict', tableNumber: 12, byPartyName: 'Kim, Jae' } as const;
    expect(canConfirm(s, false)).toBe(false);
    expect(canConfirm(s, true)).toBe(true);
    expect(confirmLabel(s)).toBe('Seat at table 12');
  });
});
