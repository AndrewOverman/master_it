import { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSharedPlan, copySharedPlan } from '../api/plans';
import type { PlanStep } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useRequireOnline } from '../lib/offline';
import { Button, EmptyState, Spinner } from '../components/ui';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

// Read-only preview of a plan someone else shared a link to — reachable
// only via a masterit://plans/shared/{token} deep link, never from normal
// in-app navigation. No step checkboxes, no editing: the only action is
// cloning it into the viewer's own plans, same as a featured-plan copy.
export function SharedPlanScreen({ route, navigation }: any) {
  const { token } = route.params;
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const requireOnline = useRequireOnline();

  const { data: plan, isLoading, isError } = useQuery({
    queryKey: ['sharedPlan', token],
    queryFn: () => getSharedPlan(token),
    retry: false,
  });

  const copyMutation = useMutation({
    mutationFn: () => copySharedPlan(token),
    onSuccess: (newPlan) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      // Crosses into the Plans tab: this preview lives under Explore, but
      // the copy the user now owns belongs with their own plans.
      navigation.navigate('Today', { screen: 'PlanDetail', params: { planId: newPlan.id } });
    },
    // Copying is unlimited on every tier (it never touches the LLM), so
    // there's no allowance case to distinguish here — anything that fails is
    // a genuine fault, and staying silent would read as a dead button.
    onError: (error: any) => {
      Alert.alert(
        'Something went wrong',
        error?.response?.data?.message ?? 'Could not add this plan. Please try again.'
      );
    },
  });

  const handleAddPress = () => {
    if (!requireOnline('add this plan')) return;
    copyMutation.mutate();
  };

  if (isLoading) {
    return <Spinner fullScreen />;
  }

  if (isError || !plan) {
    return (
      <EmptyState
        icon="link-outline"
        title="This link isn't available"
        message="The plan may have been unshared, or the link is no longer valid."
        // A dead share link is often the app's first screen (it's reachable
        // only by deep link), so there may be no history to go back to —
        // point at the feed rather than at a back button that isn't there.
        actionLabel="Browse featured plans"
        onAction={() => navigation.navigate('Featured')}
      />
    );
  }

  const renderStep = ({ item }: { item: PlanStep }) => (
    <View style={styles.stepRow}>
      <View style={styles.stepBullet} />
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{item.title}</Text>
        <Text style={styles.stepDescription} numberOfLines={3}>
          {item.description}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {plan.emoji && <Text style={styles.emoji}>{plan.emoji}</Text>}
        <Text style={styles.planTitle}>{plan.title}</Text>
        <Text style={styles.stepCount}>
          {plan.steps.length} step{plan.steps.length === 1 ? '' : 's'}
        </Text>
      </View>
      <FlatList
        data={[...plan.steps].sort((a, b) => a.order - b.order)}
        keyExtractor={(step) => String(step.id)}
        renderItem={renderStep}
        contentContainerStyle={styles.list}
      />
      <View style={styles.footer}>
        <Button label="Add to My Plans" onPress={handleAddPress} loading={copyMutation.isPending} />
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { padding: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
    emoji: { fontSize: 32, marginBottom: spacing.xxs },
    planTitle: { fontSize: typography.h2.fontSize, fontWeight: '700', color: colors.textPrimary },
    stepCount: { fontSize: typography.caption.fontSize, color: colors.textMuted, marginTop: spacing.xxs },
    list: { padding: spacing.lg, paddingBottom: spacing.xs },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
    stepBullet: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.textMuted,
      marginTop: 6,
      marginRight: 14,
    },
    stepText: { flex: 1 },
    stepTitle: { fontSize: typography.body.fontSize, fontWeight: '600', color: colors.textPrimary },
    stepDescription: { fontSize: typography.label.fontSize, color: colors.textMuted, marginTop: spacing.xxs },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
      backgroundColor: colors.background,
    },
  });
