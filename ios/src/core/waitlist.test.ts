import type { SeatedParty, WaitingParty } from './party';
import {
  findWaitingById,
  formatWaitingMinutes,
  recentTableNumbers,
  sortByPosition,
  tableIsOccupied,
} from './waitlist';

function mkWaiting(over: Partial<WaitingParty> & Pick<WaitingParty, 'id' | 'position'>): WaitingParty {
  const base: WaitingParty = {
    id: over.id,
    code: over.id,
    position: over.position,
    name: `P-${over.id}`,
    partySize: 2,
    phoneMasked: '******1234',
    phoneForDial: '+15551234567',
    joinedAt: '2026-04-14T18:30:00Z',
    etaAt: '2026-04-14T18:42:00Z',
    waitingMinutes: 0,
    state: 'waiting',
    unreadChat: 0,
    onMyWayAt: null,
    calls: [],
  };
  return { ...base, ...over };
}

function mkSeated(over: Partial<SeatedParty> & Pick<SeatedParty, 'id' | 'tableNumber' | 'seatedAt'>): SeatedParty {
  const base: SeatedParty = {
    id: over.id,
    name: `P-${over.id}`,
    partySize: 2,
    phoneMasked: '******1234',
    tableNumber: over.tableNumber,
    state: 'seated',
    seatedAt: over.seatedAt,
    timeInStateMinutes: 0,
    totalTableMinutes: 0,
    waitMinutes: 15,
    toOrderMinutes: null,
    toServeMinutes: null,
    toCheckoutMinutes: null,
  };
  return { ...base, ...over };
}

describe('waitlist helpers', () => {
  const waiting: WaitingParty[] = [
    mkWaiting({ id: 'c', position: 3 }),
    mkWaiting({ id: 'a', position: 1 }),
    mkWaiting({ id: 'b', position: 2, state: 'called' }),
  ];

  const seated: SeatedParty[] = [
    mkSeated({ id: 't1', tableNumber: 12, seatedAt: '2026-04-14T19:00:00Z', state: 'seated' }),
    mkSeated({ id: 't2', tableNumber: 14, seatedAt: '2026-04-14T19:05:00Z', state: 'served' }),
    mkSeated({ id: 't3', tableNumber: 7, seatedAt: '2026-04-14T18:00:00Z', state: 'ordered' }),
  ];

  test('sortByPosition orders waiting parties by position ascending', () => {
    expect(sortByPosition(waiting).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('findWaitingById returns undefined for unknown id', () => {
    expect(findWaitingById(waiting, 'nope')).toBeUndefined();
    expect(findWaitingById(waiting, 'a')?.position).toBe(1);
  });

  test('tableIsOccupied scans seated parties only', () => {
    expect(tableIsOccupied(seated, 12)?.id).toBe('t1');
    expect(tableIsOccupied(seated, 14)?.id).toBe('t2');
    expect(tableIsOccupied(seated, 7)?.id).toBe('t3');
    expect(tableIsOccupied(seated, 99)).toBeNull();
  });

  test('tableIsOccupied honors excludePartyId (re-seat flow)', () => {
    expect(tableIsOccupied(seated, 12, 't1')).toBeNull();
  });

  test('recentTableNumbers returns dedup-ed most-recent N by seatedAt desc', () => {
    expect(recentTableNumbers(seated, 5)).toEqual([14, 12, 7]);
  });

  test('formatWaitingMinutes uses "Nm" under 1h and "Hh Mm" at/above', () => {
    expect(formatWaitingMinutes(0)).toBe('0m');
    expect(formatWaitingMinutes(5)).toBe('5m');
    expect(formatWaitingMinutes(59)).toBe('59m');
    expect(formatWaitingMinutes(60)).toBe('1h 0m');
    expect(formatWaitingMinutes(75)).toBe('1h 15m');
  });
});
