import type { TextStyle } from 'react-native';

// Consolidates the 17 raw font sizes found across screens
// (12, 12.5, 13, 14, 14.5, 15, 16, 17, 18, 19, 20, 22, 24, 26, 30, 32, 40)
// into one named scale. Weight is deliberately limited to the three values
// already in de facto use app-wide (regular/semibold/bold).
type TypeStyle = Pick<TextStyle, 'fontSize' | 'fontWeight' | 'lineHeight'>;

export const typography: Record<
  'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMedium' | 'label' | 'caption' | 'small',
  TypeStyle
> = {
  display: { fontSize: 32, fontWeight: '700', lineHeight: 38 },
  h1: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodyMedium: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  label: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  small: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
};
