// Consolidates the dozen-plus raw spacing values found across screens
// (4, 6, 8, 10, 12, 14, 16, 20, 22, 24, 28, 32...) into one scale.
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export type SpacingToken = keyof typeof spacing;
