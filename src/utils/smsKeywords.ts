// ============================================================================
// SKB — SMS keyword matchers (issue #69)
// ============================================================================
// Pure functions with no DB / IO dependencies, unit-tested directly. Used by
// the shared-number inbound handler to recognize STOP/START/HELP before any
// tenant resolution kicks in.
//
// We accept the common keyword variants from CTIA messaging principles plus
// a few of Twilio's documented aliases. Case-insensitive, leading whitespace
// tolerated, and we only match when the keyword is the *first token* of the
// message — so "stop sending table updates" is a STOP, but "stop at the
// store on your way" is not.

function firstToken(body: string): string {
    return body.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

const STOP_KEYWORDS = new Set([
    'stop', 'stopall', 'unsubscribe', 'end', 'quit', 'cancel', 'optout', 'revoke',
]);

const START_KEYWORDS = new Set([
    'start', 'unstop', 'yes', 'optin',
]);

const HELP_KEYWORDS = new Set([
    'help', 'info',
]);

export function isStopKeyword(body: string): boolean {
    return STOP_KEYWORDS.has(firstToken(body));
}

export function isStartKeyword(body: string): boolean {
    return START_KEYWORDS.has(firstToken(body));
}

export function isHelpKeyword(body: string): boolean {
    return HELP_KEYWORDS.has(firstToken(body));
}
