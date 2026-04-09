// ============================================================================
// SKB — SMS message templates
// ============================================================================

export function joinConfirmationMessage(code: string, statusUrl: string): string {
    return `SKB: You're on the list! Track your place in line here: ${statusUrl}. Code: ${code}`;
}

export function firstCallMessage(code: string): string {
    return `SKB: Your table is ready! Please head to the front whenever you're ready. Show code ${code} to the host.`;
}

export function repeatCallMessage(code: string, callCount: number): string {
    return `SKB: Just a friendly reminder — we've called your name ${callCount} times. Your table is waiting for you! Code: ${code}.`;
}
