// Consolidates the ad hoc border-radius values found across screens
// (2, 4, 8, 10, 12, 13, 14, 16, 20, 26...) into one scale.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
