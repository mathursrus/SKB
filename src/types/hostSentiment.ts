export type HostSentiment = 'happy' | 'neutral' | 'upset';
export type HostSentimentSource = 'automatic' | 'manual';

export const HOST_SENTIMENT_VALUES: HostSentiment[] = ['happy', 'neutral', 'upset'];

export function deriveHostSentiment(
    waitingMinutes: number,
    avgTurnTimeMinutes: number,
): HostSentiment {
    const baseline = Math.max(1, avgTurnTimeMinutes);
    if (waitingMinutes >= baseline * 2) return 'upset';
    if (waitingMinutes > baseline) return 'neutral';
    return 'happy';
}

export function isHostSentiment(value: unknown): value is HostSentiment {
    return typeof value === 'string' && HOST_SENTIMENT_VALUES.includes(value as HostSentiment);
}
