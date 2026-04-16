import { useColorScheme } from 'react-native';

// ============================================================================
// Theme tokens — light + dark palettes, plus a `useTheme()` hook that honors
// the OS color scheme via React Native's `useColorScheme`.
//
// Historically the app was dark-only and components did `import { theme } from
// '@/ui/theme'` for styles. For backward compatibility we keep that default
// export pointing at the dark palette; new code should use `useTheme()` so
// it reacts to system light/dark preference changes.
// ============================================================================

const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

const font = {
  tabular: { fontVariant: ['tabular-nums'] as const },
} as const;

// --- Color palettes ---

export interface Palette {
  surface: string;
  surfaceRaised: string;
  line: string;
  text: string;
  textMuted: string;
  accent: string;
  ok: string;
  warn: string;
}

export const darkPalette: Palette = {
  surface: '#171a21',
  surfaceRaised: '#1e222c',
  line: '#2a2f3a',
  text: '#f4f4f5',
  textMuted: '#9aa3b2',
  accent: '#ffb347',
  ok: '#4ade80',
  warn: '#f87171',
};

export const lightPalette: Palette = {
  surface: '#fafafa',
  surfaceRaised: '#ffffff',
  line: '#e4e4e7',
  text: '#18181b',
  textMuted: '#52525b',
  accent: '#e08a2e',
  ok: '#15803d',
  warn: '#b91c1c',
};

function makeTheme(color: Palette) {
  return { color, space, radius, font };
}

export type Theme = ReturnType<typeof makeTheme>;

export const darkTheme: Theme = makeTheme(darkPalette);
export const lightTheme: Theme = makeTheme(lightPalette);

/**
 * Hook that returns the active theme based on `useColorScheme()`.
 * Defaults to dark if the OS scheme is unknown.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'light' ? lightTheme : darkTheme;
}

// Backward-compat default export — dark theme, as the app originally shipped.
// Existing screens that read `theme.color.surface` continue to render dark.
// Screens migrated to `useTheme()` react to system theme automatically.
export const theme = darkTheme;
