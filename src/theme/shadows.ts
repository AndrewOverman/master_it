import type { ViewStyle } from 'react-native';

// The app's two elevation recipes: `card` for modals and raised surfaces,
// `fab` for the floating action button. Kept here so every lifted surface
// casts the same shadow instead of each one hand-rolling its own values.
export const shadows: Record<'card' | 'fab', ViewStyle> = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  fab: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
};
