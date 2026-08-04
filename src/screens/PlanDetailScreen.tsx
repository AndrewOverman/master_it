import React, { useLayoutEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlan, setStepComplete, getRelatedPlans, sharePlan } from '../api/plans';
import { useCopyPlan } from '../hooks/useCopyPlan';
import { PlanCard } from '../components/PlanCard';
import { PlanLimitModal } from '../components/PlanLimitModal';
import type { Plan, PlanStep } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline, useRequireOnline } from '../lib/offline';
import { formatRelativeTime } from '../utils/relativeTime';

export function PlanDetailScreen({ route, navigation }: any) {
  const { planId } = route.params;
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = useIsOnline();
  const requireOnline = useRequireOnline();

  const { data: plan, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId),
  });

  // Independent of the query above — the backend reads the current
  // plan's prompt itself via the route-bound model, so this doesn't
  // need to wait on `plan` to load first. Not useful offline (it's
  // never persisted), so don't bother attempting it without a connection.
  const { data: relatedPlans } = useQuery({
    queryKey: ['plan', planId, 'related'],
    queryFn: () => getRelatedPlans(planId),
    enabled: isOnline,
  });

  const { copyMutation, handleCopyPress, limitModalVisible, limitModalMessage, dismissLimitModal } =
    useCopyPlan(navigation);

  const shareMutation = useMutation({
    mutationFn: () => sharePlan(planId),
    onSuccess: (token) => {
      const url = `masterit://plans/shared/${token}`;
      Share.share({ message: `Check out my plan on Master It: ${url}`, url });
    },
    onError: () => {
      Alert.alert('Something went wrong', 'Could not create a share link. Please try again.');
    },
  });

  const handleSharePress = () => {
    if (!requireOnline('share this plan')) return;
    shareMutation.mutate();
  };

  // Only a finished plan is shareable (mirrors the backend's own gate on
  // POST /plans/{plan}/share), so the button only appears once ready.
  useLayoutEffect(() => {
    if (plan?.status !== 'ready') {
      navigation.setOptions({ headerRight: undefined });
      return;
    }
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSharePress}
          disabled={shareMutation.isPending}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {shareMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Ionicons name="share-outline" size={24} color={colors.textPrimary} />
          )}
        </TouchableOpacity>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, plan?.status, shareMutation.isPending, colors]);

  const applyStepCompletion = (plan: Plan, stepId: number, completed: boolean): Plan => ({
    ...plan,
    steps: plan.steps.map((step) =>
      step.id === stepId ? { ...step, completed_at: completed ? new Date().toISOString() : null } : step
    ),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ stepId, completed }: { stepId: number; completed: boolean }) =>
      setStepComplete(planId, stepId, completed),
    // Optimistic update so checking a step feels instant. Also patches the
    // ['plans'] list cache — the My Plans screen stays mounted underneath
    // (React Navigation doesn't unmount screens on push), so without this
    // its steps-complete count stays stale until something else refetches it.
    onMutate: async ({ stepId, completed }) => {
      await queryClient.cancelQueries({ queryKey: ['plan', planId] });
      const previousPlan = queryClient.getQueryData<Plan>(['plan', planId]);
      const previousPlans = queryClient.getQueryData<Plan[]>(['plans']);

      queryClient.setQueryData<Plan>(['plan', planId], (old) =>
        old ? applyStepCompletion(old, stepId, completed) : old
      );
      queryClient.setQueryData<Plan[]>(['plans'], (old) =>
        old?.map((plan) => (plan.id === planId ? applyStepCompletion(plan, stepId, completed) : plan))
      );

      return { previousPlan, previousPlans };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousPlan) {
        queryClient.setQueryData(['plan', planId], context.previousPlan);
      }
      if (context?.previousPlans) {
        queryClient.setQueryData(['plans'], context.previousPlans);
      }
    },
    // Celebrate only on the transition into "every step done" — checking off
    // a step in an already-complete plan (shouldn't normally happen, but
    // just in case) shouldn't re-trigger it. The celebration overlay itself
    // lives on PlansList, so hop back there with a flag for it to pick up.
    onSuccess: (updatedStep, { stepId, completed }) => {
      if (!completed) return;
      const latestPlan = queryClient.getQueryData<Plan>(['plan', planId]);
      if (!latestPlan) return;
      const stepsAfter = latestPlan.steps.map((step) =>
        step.id === stepId ? { ...step, completed_at: updatedStep.completed_at } : step
      );
      const allStepsComplete = stepsAfter.length > 0 && stepsAfter.every((step) => step.completed_at);
      if (allStepsComplete) {
        navigation.navigate('PlansList', { celebrate: true });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', planId] });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });

  if (isLoading || !plan) {
    if (!isOnline) {
      return (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textPlaceholder} />
          <Text style={styles.emptyText}>
            Can't load this plan — you're offline and haven't opened it before.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  const completedCount = plan.steps.filter((step) => step.completed_at).length;
  const syncedLabel = formatRelativeTime(dataUpdatedAt);

  const renderStep = ({ item }: { item: PlanStep }) => {
    const completed = Boolean(item.completed_at);

    return (
      <View style={styles.stepRow}>
        <TouchableOpacity
          style={styles.checkboxTouchable}
          onPress={() => {
            if (!requireOnline('check off a step')) return;
            toggleMutation.mutate({ stepId: item.id, completed: !completed });
          }}
        >
          <View style={[styles.checkbox, completed && styles.checkboxChecked]}>
            {completed && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.stepContent}
          onPress={() => navigation.navigate('StepDetail', { planId, stepId: item.id })}
        >
          <View style={styles.stepText}>
            <Text style={[styles.stepTitle, completed && styles.stepTitleDone]}>{item.title}</Text>
            <Text style={styles.stepDescription} numberOfLines={2}>
              {item.description}
            </Text>
            {item.due_date && <Text style={styles.stepDueDate}>Aiming for {item.due_date}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <PlanLimitModal visible={limitModalVisible} message={limitModalMessage} onDismiss={dismissLimitModal} />
      <View style={styles.header}>
        <Text style={styles.planTitle}>{plan.title}</Text>
        <Text style={styles.progress}>
          {completedCount} of {plan.steps.length} steps complete
        </Text>
        {!isOnline && (
          <View style={styles.offlineRow}>
            <Ionicons name="cloud-offline-outline" size={13} color={colors.textPlaceholder} />
            <Text style={styles.offlineText}>
              You're offline{syncedLabel ? ` — synced ${syncedLabel}` : ''}. Editing is disabled until you're back online.
            </Text>
          </View>
        )}
      </View>
      <FlatList
        data={[...plan.steps].sort((a, b) => a.order - b.order)}
        keyExtractor={(step) => String(step.id)}
        renderItem={renderStep}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          relatedPlans && relatedPlans.length > 0 ? (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedTitle}>Related Plans</Text>
              {relatedPlans.map((related) => (
                <PlanCard
                  key={related.id}
                  plan={related}
                  onCopy={() => handleCopyPress(related)}
                  isCopying={copyMutation.isPending && copyMutation.variables === related.id}
                />
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 10 },
    emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
    header: { padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
    planTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    progress: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    offlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    offlineText: { flex: 1, fontSize: 12, color: colors.textPlaceholder },
    list: { padding: 20 },
    relatedSection: { marginTop: 12, paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.borderMuted },
    relatedTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    checkboxTouchable: { paddingTop: 2 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    checkboxChecked: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
    checkmark: { color: colors.background, fontSize: 13, fontWeight: '700' },
    stepContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    stepText: { flex: 1 },
    stepTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    stepTitleDone: { textDecorationLine: 'line-through', color: colors.textPlaceholder },
    stepDescription: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    stepDueDate: { fontSize: 12, color: colors.textPlaceholder, marginTop: 4 },
  });
