import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getPlan } from '../api/plans';
import { useCopyPlan } from '../hooks/useCopyPlan';
import { PlanLimitModal } from '../components/PlanLimitModal';
import type { PlanStep } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, EmptyState, Spinner } from '../components/ui';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';

const SKILL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Some experience',
  advanced: 'Advanced',
};

const TIME_LABELS: Record<string, string> = {
  light: '~15 min/day',
  moderate: '~1 hr/day',
  intensive: 'Several hrs/day',
};

/**
 * Read-only look at a featured plan before adding it.
 *
 * The feed used to make "add" the only thing you could do with a card, so
 * people committed to a plan without ever seeing what was in it. This is the
 * step list, plus the same add action.
 *
 * Deliberately similar to SharedPlanScreen, which does the same job for a
 * shared link — they differ in where the plan comes from (id vs. token) and
 * which copy endpoint applies, so they're kept separate rather than merged
 * behind a flag.
 */
export function FeaturedPlanScreen({ route, navigation }: any) {
  const { planId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: plan, isLoading, isError } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId),
    retry: false,
  });

  const { copyMutation, handleCopyPress, limitModalVisible, limitModalMessage, dismissLimitModal } =
    useCopyPlan(navigation);

  if (isLoading) return <Spinner fullScreen />;

  if (isError || !plan) {
    return (
      <EmptyState
        icon="albums-outline"
        title="This plan isn't available"
        message="It may no longer be featured. Try another one from the feed."
        actionLabel="Back to featured plans"
        onAction={() => navigation.goBack()}
      />
    );
  }

  const renderStep = ({ item }: { item: PlanStep }) => (
    <View style={styles.stepRow}>
      <View style={styles.stepBullet} />
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{item.title}</Text>
        <Text style={styles.stepDescription}>{item.description}</Text>
      </View>
    </View>
  );

  const badges = [
    plan.skill_level ? SKILL_LABELS[plan.skill_level] : null,
    plan.time_commitment ? TIME_LABELS[plan.time_commitment] : null,
    plan.target_days ? `${plan.target_days} days` : null,
  ].filter(Boolean) as string[];

  return (
    <View style={styles.container}>
      <PlanLimitModal
        visible={limitModalVisible}
        message={limitModalMessage}
        onDismiss={dismissLimitModal}
      />
      <FlatList
        data={[...plan.steps].sort((a, b) => a.order - b.order)}
        keyExtractor={(step) => String(step.id)}
        renderItem={renderStep}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            {plan.emoji && <Text style={styles.emoji}>{plan.emoji}</Text>}
            <Text style={styles.planTitle}>{plan.title}</Text>
            <Text style={styles.stepCount}>
              {plan.steps.length} step{plan.steps.length === 1 ? '' : 's'}
            </Text>
            {badges.length > 0 && (
              <View style={styles.badgeRow}>
                {badges.map((label) => (
                  <View key={label} style={styles.badge}>
                    <Text style={styles.badgeText}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        }
      />
      <View style={styles.footer}>
        <Button
          label="Add to My Plans"
          onPress={() => handleCopyPress(plan)}
          loading={copyMutation.isPending}
        />
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingBottom: spacing.md, marginBottom: spacing.sm },
    emoji: { fontSize: 40, marginBottom: spacing.xs },
    planTitle: { fontSize: typography.h2.fontSize, fontWeight: '700', color: colors.textPrimary },
    stepCount: { fontSize: typography.caption.fontSize, color: colors.textMuted, marginTop: spacing.xxs },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
    badge: {
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    badgeText: { fontSize: typography.small.fontSize, color: colors.textSecondary, fontWeight: '500' },
    list: { padding: spacing.lg, paddingBottom: spacing.sm },
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
    stepDescription: { fontSize: typography.label.fontSize, lineHeight: typography.label.lineHeight, color: colors.textMuted, marginTop: spacing.xxs },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
      backgroundColor: colors.background,
    },
  });
