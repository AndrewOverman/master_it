import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { retryPlan } from '../api/plans';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useRequireOnline } from '../lib/offline';
import { Button } from '../components/ui';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

// Shown when generation errored server-side (Plan.status === 'failed').
//
// "Try again" re-runs the *same* plan rather than sending the user back to a
// create form: the plan row already holds their prompt and settings, and the
// generation allowance was charged on dispatch and never refunded — so
// starting over would cost them both their typing and a second generation
// for a plan they never received.
export function PlanFailedScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { planId, message } = route.params ?? {};
  const requireOnline = useRequireOnline();

  const retryMutation = useMutation({
    mutationFn: () => retryPlan(planId),
    onSuccess: () => navigation.replace('Generating', { planId }),
    onError: (error: any) => {
      Alert.alert(
        "Couldn't retry",
        error?.response?.data?.message ?? 'Please check your connection and try again.'
      );
    },
  });

  const handleRetry = () => {
    if (!requireOnline('retry this plan')) return;
    retryMutation.mutate();
  };

  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
      <Text style={styles.title}>Couldn't build your plan</Text>
      <Text style={styles.message}>
        {message ?? 'Something went wrong while generating this plan.'}
      </Text>
      <Text style={styles.reassurance}>
        Your goal and settings are saved. Trying again won't use another plan generation.
      </Text>

      <View style={styles.actions}>
        <Button label="Try again" onPress={handleRetry} loading={retryMutation.isPending} />
        <Button
          label="Back to my plans"
          variant="secondary"
          // navigate, not replace — this screen is reachable both from the
          // generating flow and from a tapped row on the list itself, and
          // replacing would leave a second PlansList stacked on the first.
          onPress={() => navigation.navigate('PlansList')}
          disabled={retryMutation.isPending}
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
    reassurance: {
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      color: colors.textPlaceholder,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    actions: { alignSelf: 'stretch', maxWidth: 360, width: '100%', marginTop: spacing.xl },
    secondaryButton: { marginTop: spacing.sm },
  });
