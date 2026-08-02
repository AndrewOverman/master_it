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
  link: string;
  destructive: string;
  success: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  border: '#E5E7EB',
  borderMuted: '#F3F4F6',
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textPlaceholder: '#9CA3AF',
  link: '#2563EB',
  destructive: '#DC2626',
  success: '#22C55E',
  overlay: 'rgba(17, 24, 39, 0.4)',
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
  link: '#60A5FA',
  destructive: '#F87171',
  success: '#34D399',
  overlay: 'rgba(0, 0, 0, 0.6)',
};
