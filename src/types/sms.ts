// ============================================================================
// SKB — SMS types (issue #69)
// ============================================================================

/**
 * Opt-out ledger shared across all tenants. A diner who replies STOP to any
 * tenant's outbound text is suppressed platform-wide, because the underlying
 * Twilio number is shared: carrier-level STOP on the shared number blocks
 * the phone regardless of which tenant's message triggered the reply. We
 * record it app-side too so outbound attempts short-circuit before dispatch
 * and don't generate log noise.
 */
export interface SmsOptOut {
    phone: string;               // 10-digit, normalized (no country code, no formatting)
    optedOutAt: Date;
    lastSeenTenants: string[];   // informational only; last few tenants this phone was active at
}
