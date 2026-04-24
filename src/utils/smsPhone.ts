// ============================================================================
// SKB — Phone normalization for SMS routing (issue #69)
// ============================================================================
// Twilio delivers `From` in E.164 (e.g. "+12065551234"). Our queueEntries
// `phone` is stored as a 10-digit US string (e.g. "2065551234"). Reduce both
// to the same shape before comparing. Lifted from the inline normalization
// already used in services/chat.ts::appendInbound so the two code paths
// stay behaviorally identical.

export function normalizePhone(raw: string): string {
    return String(raw).replace(/\D/g, '').replace(/^1/, '').slice(-10);
}
