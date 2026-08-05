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

export const lightColors: ThemeColors = {
  background: '#FDF8F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F5EDE4',
  border: '#E8DDD0',
  borderMuted: '#F0E6DA',
  textPrimary: '#2B2420',
  textSecondary: '#52463C',
  textMuted: '#7A6B5D',
  textPlaceholder: '#96806F',
  accent: '#B84F1E',
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
  textPrimary: '#F9FAFB',
  textSecondary: '#D1D5DB',
  textMuted: '#9CA3AF',
  textPlaceholder: '#6B7280',
  accent: '#60A5FA',
  accentMuted: '#1E3A5C',
  destructive: '#F87171',
  success: '#34D399',
  overlay: 'rgba(0, 0, 0, 0.6)',
};
