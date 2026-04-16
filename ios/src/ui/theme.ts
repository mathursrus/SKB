export const theme = {
  color: {
    surface: '#171a21',
    surfaceRaised: '#1e222c',
    line: '#2a2f3a',
    text: '#f4f4f5',
    textMuted: '#9aa3b2',
    accent: '#ffb347',
    ok: '#4ade80',
    warn: '#f87171',
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
  },
  font: {
    tabular: { fontVariant: ['tabular-nums'] as const },
  },
} as const;

export type Theme = typeof theme;
