import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

// Shared "create a plan" affordance for My Plans and Featured Plans — same
// shape, position, and weight on both screens so the action is predictable
// wherever it appears. Label is a prop so each screen can keep it
// contextual (e.g. distinguishing "start fresh" from Featured's per-card
// "Copy" action) without diverging on the pattern itself.
// Offset is a plain 20 rather than `insets.bottom + 20`: every screen showing
// this FAB sits inside a tab navigator, and the tab bar already absorbs the
// bottom safe-area inset. Adding it again floats the button a visible gap
// above the bar.
export function CreatePlanFab({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="add" size={22} color={colors.background} />
      <Text style={styles.fabLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      bottom: 20,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      // Grows with the label rather than cropping it at large text sizes.
      minHeight: 52,
      paddingHorizontal: 22,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
      ...shadows.fab,
    },
    fabLabel: { color: colors.background, fontSize: typography.bodyMedium.fontSize, fontWeight: '600' },
  });
