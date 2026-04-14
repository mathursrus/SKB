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

// Host quick-reply templates exposed on the chat drawer (R10).
export function chatAlmostReadyMessage(code: string): string {
    return `SKB: Your table is almost ready — about 5 more minutes. Code ${code}.`;
}

export function chatNeedMoreTimeMessage(code: string): string {
    return `SKB: Do you need a few more minutes? Reply YES and we'll hold your spot. Code ${code}.`;
}

export function chatLostYouMessage(code: string): string {
    return `SKB: We tried to find your party and didn't see you — are you still nearby? Reply YES to keep your spot. Code ${code}.`;
}
