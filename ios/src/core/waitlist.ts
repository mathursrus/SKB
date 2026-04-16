import type { PartyId, SeatedParty, WaitingParty } from './party';

export function sortByPosition(parties: readonly WaitingParty[]): WaitingParty[] {
  return [...parties].sort((a, b) => a.position - b.position);
}

export function findWaitingById(
  parties: readonly WaitingParty[],
  id: PartyId,
): WaitingParty | undefined {
  return parties.find((p) => p.id === id);
}

export function tableIsOccupied(
  seated: readonly SeatedParty[],
  tableNumber: number,
  excludePartyId?: PartyId,
): SeatedParty | null {
  for (const p of seated) {
    if (excludePartyId && p.id === excludePartyId) continue;
    if (p.tableNumber === tableNumber) return p;
  }
  return null;
}

export function recentTableNumbers(
  seated: readonly SeatedParty[],
  n = 5,
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const bySeatedDesc = [...seated]
    .filter((p) => p.tableNumber !== null)
    .sort((a, b) => b.seatedAt.localeCompare(a.seatedAt));
  for (const p of bySeatedDesc) {
    const t = p.tableNumber as number;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Format a waiting duration. Input is integer minutes from
 * HostPartyDTO.waitingMinutes — the server computes it, we only render.
 * Used for the row "Waiting" column and the Seat dialog header.
 */
export function formatWaitingMinutes(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const mins = total - hours * 60;
  return `${hours}h ${mins}m`;
}
