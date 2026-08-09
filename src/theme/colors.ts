export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderMuted: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textPlaceholder: string;
  accent: string;
  accentMuted: string;
  destructive: string;
  success: string;
  overlay: string;
}

// Contrast ratios below are WCAG 2.1 against this theme's own `background`.
// The text tokens are all used for real content at 11–14px, so 4.5:1 (AA
// normal text) is the bar, not the 3:1 large-text allowance.
export const lightColors: ThemeColors = {
  background: '#FDF8F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F5EDE4',
  border: '#E8DDD0',
  borderMuted: '#F0E6DA',
  textPrimary: '#2B2420', // 14.5:1
  textSecondary: '#52463C', // 8.7:1
  textMuted: '#7A6B5D', // 4.9:1
  // 5.3:1, and clears 4.5:1 on `surface` and `surfaceMuted` too. Held to the
  // AA normal-text bar despite the name: this token carries due dates,
  // offline notices and progress labels, not just input placeholders.
  textPlaceholder: '#7A6355',
  accent: '#B84F1E', // 4.8:1
  // KNOWN ISSUE: `accent` text on this is 3.9:1, which fails AA — it's the
  // combination behind the example chips on New Plan, the session banner on
  // Login, and Avatar initials. Lightening this token to fix it takes it to
  // #FBF1E6, at which point it's 1.06:1 against `background` and reads as no
  // fill at all. The fix is to darken `accent` itself (#A8461A clears both),
  // which is a brand-colour decision and belongs with the light/dark accent
  // reconciliation rather than here.
  accentMuted: '#F5DFC9',
  destructive: '#C4452F',
  success: '#4A7C59',
  overlay: 'rgba(43, 36, 32, 0.45)',
};

export const darkColors: ThemeColors = {
  background: '#0B0F17',
  surface: '#161B26',
  surfaceMuted: '#1F2531',
  border: '#2D3444',
  borderMuted: '#232936',
  textPrimary: '#F9FAFB', // 18.4:1
  textSecondary: '#D1D5DB', // 13.0:1
  textMuted: '#9CA3AF', // 7.6:1
  // 6.1:1, and clears 4.5:1 on `surface` and `surfaceMuted` too — held to
  // the same AA bar as the light theme's, for the same reason.
  textPlaceholder: '#8A929E',
  accent: '#60A5FA',
  accentMuted: '#1E3A5C',
  destructive: '#F87171',
  success: '#34D399',
  overlay: 'rgba(0, 0, 0, 0.6)',
};
