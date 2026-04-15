import type { PartyId, SeatedParty } from './party';
import { tableIsOccupied } from './waitlist';

export type SeatInputState =
  | { kind: 'empty' }
  | { kind: 'invalid'; reason: 'out_of_range' | 'not_numeric' }
  | { kind: 'valid'; tableNumber: number }
  | { kind: 'conflict'; tableNumber: number; byPartyName: string };

export interface SeatInput {
  raw: string;
  seated: readonly SeatedParty[];
  excludePartyId?: PartyId;
}

export const MIN_TABLE = 1;
export const MAX_TABLE = 999;

export function validateSeatInput({ raw, seated, excludePartyId }: SeatInput): SeatInputState {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };
  if (!/^\d+$/.test(trimmed)) return { kind: 'invalid', reason: 'not_numeric' };
  const tableNumber = parseInt(trimmed, 10);
  if (tableNumber < MIN_TABLE || tableNumber > MAX_TABLE) {
    return { kind: 'invalid', reason: 'out_of_range' };
  }
  const conflict = tableIsOccupied(seated, tableNumber, excludePartyId);
  if (conflict) return { kind: 'conflict', tableNumber, byPartyName: conflict.name };
  return { kind: 'valid', tableNumber };
}

export function confirmLabel(state: SeatInputState): string {
  switch (state.kind) {
    case 'empty':
    case 'invalid':
      return 'Seat at table —';
    case 'valid':
    case 'conflict':
      return `Seat at table ${state.tableNumber}`;
  }
}

export function canConfirm(state: SeatInputState, overrideArmed: boolean): boolean {
  if (state.kind === 'valid') return true;
  if (state.kind === 'conflict' && overrideArmed) return true;
  return false;
}
