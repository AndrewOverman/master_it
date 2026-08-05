import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSharedPlan, copySharedPlan } from '../api/plans';
import { PlanLimitModal } from '../components/PlanLimitModal';
import type { PlanStep } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useRequireOnline } from '../lib/offline';
import { Button, EmptyState, Spinner } from '../components/ui';

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
  const [limitModalMessage, setLimitModalMessage] = useState<string | null>(null);

  const { data: plan, isLoading, isError } = useQuery({
    queryKey: ['sharedPlan', token],
    queryFn: () => getSharedPlan(token),
    retry: false,
  });

  const copyMutation = useMutation({
    mutationFn: () => copySharedPlan(token),
    onSuccess: (newPlan) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      // Replace, not push — the preview shouldn't stay in the back stack
      // once the user owns a real copy of it.
      navigation.replace('PlanDetail', { planId: newPlan.id });
    },
    onError: (error: any) => {
      if (error?.response?.status === 429) {
        setLimitModalMessage(
          error?.response?.data?.message ?? "You've reached your plan limit."
        );
      }
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
      <PlanLimitModal
        visible={limitModalMessage !== null}
        message={limitModalMessage ?? ''}
        onDismiss={() => setLimitModalMessage(null)}
      />
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
    header: { padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
    emoji: { fontSize: 32, marginBottom: 4 },
    planTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    stepCount: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    list: { padding: 20, paddingBottom: 8 },
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
    stepTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    stepDescription: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    footer: {
      padding: 20,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
      backgroundColor: colors.background,
    },
  });
