// ============================================================================
// SKB - Name redaction for public waitlist rows (R3 PII minimization)
// ============================================================================
//
// The customer-facing status page shows every party in line so diners can see
// how far back they are. To keep surnames off a publicly-reachable URL we only
// expose first name + last initial: "Sana P." rather than "Sana Patel".
//
// Input formats we accept:
//   "Patel, Sana"   -> "Sana P."
//   "Sana Patel"    -> "Sana P."
//   "Sana"          -> "Sana"
//   "Sana M. Patel" -> "Sana P."
//   ""              -> "Guest"
//
// If we can't parse anything sensible we fall back to "Guest" rather than
// leaking raw input.
// ============================================================================

export function redactName(raw: string | null | undefined): string {
    if (!raw) return 'Guest';
    const trimmed = raw.trim();
    if (trimmed.length === 0) return 'Guest';

    // "Last, First" form.
    if (trimmed.includes(',')) {
        const [last, firstRaw] = trimmed.split(',', 2);
        const first = (firstRaw ?? '').trim().split(/\s+/)[0] ?? '';
        const lastInitial = (last ?? '').trim().charAt(0);
        if (first && lastInitial) return `${capitalize(first)} ${lastInitial.toUpperCase()}.`;
        if (first) return capitalize(first);
        return 'Guest';
    }

    // "First [Middle...] Last" form.
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Guest';
    if (parts.length === 1) return capitalize(parts[0]);
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${capitalize(first)} ${last.charAt(0).toUpperCase()}.`;
}

function capitalize(word: string): string {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
}
