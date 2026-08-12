import type { TextStyle } from 'react-native';

// The app's whole type scale. Screens pick from here rather than writing
// raw font sizes. Weight is deliberately limited to three values
// (regular/semibold/bold) so headings can't drift apart from each other.
type TypeStyle = Pick<TextStyle, 'fontSize' | 'fontWeight' | 'lineHeight'>;

export const typography: Record<
  'h1' | 'h2' | 'h3' | 'body' | 'bodyMedium' | 'label' | 'caption' | 'small',
  TypeStyle
> = {
  h1: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodyMedium: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  label: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  small: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
};
