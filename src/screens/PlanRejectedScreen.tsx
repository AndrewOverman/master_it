import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button } from '../components/ui';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

// Shown when the backend declines to generate a plan for the submitted goal
// (Plan.status === 'rejected'). Deliberately separate from PlanFailedScreen:
// "failed" implies a bug worth retrying as-is, this implies a boundary — so
// there's no retry here, since re-running the identical prompt would only be
// rejected again. The copy stays neutral and non-accusatory, never echoes the
// user's prompt or the model's internal category back at them, and always
// leaves a way forward.
export function PlanRejectedScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Ionicons name="information-circle-outline" size={40} color={colors.textMuted} />
      <Text style={styles.title}>We can't build a plan for that</Text>
      <Text style={styles.message}>
        This request falls outside what Master It can help with. Try rephrasing your goal.
      </Text>

      <View style={styles.actions}>
        {/* navigate, not replace: when the create flow is still in the stack
            this returns to the form with the rejected goal intact, which is
            exactly what someone needs to reword rather than retype. */}
        <Button label="Start a new plan" onPress={() => navigation.navigate('NewPlan')} />
        <Button
          label="Back to my plans"
          variant="secondary"
          onPress={() => navigation.navigate('PlansList')}
          style={styles.secondaryButton}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: typography.h3.fontSize,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    message: {
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      color: colors.textMuted,
      textAlign: 'center',
    },
    actions: { alignSelf: 'stretch', maxWidth: 360, width: '100%', marginTop: spacing.xl },
    secondaryButton: { marginTop: spacing.sm },
  });
