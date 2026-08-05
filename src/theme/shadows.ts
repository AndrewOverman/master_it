import type { ViewStyle } from 'react-native';

// Consolidates the two shadow "recipes" that were previously hand-copied
// with slightly different values in PlanCompleteOverlay, PlanLimitModal,
// RefinePlanModal, and the My Plans FAB.
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
