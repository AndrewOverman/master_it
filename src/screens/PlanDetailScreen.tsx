import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlan, setStepComplete, getRelatedPlans, sharePlan } from '../api/plans';
import { useCopyPlan } from '../hooks/useCopyPlan';
import { useRefinePlan } from '../hooks/useRefinePlan';
import { PlanCard } from '../components/PlanCard';
import { PlanLimitModal } from '../components/PlanLimitModal';
import { RefinePlanModal } from '../components/RefinePlanModal';
import type { Plan, PlanStep, RefinementTag } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline, useRequireOnline } from '../lib/offline';
import { formatRelativeTime } from '../utils/relativeTime';
import { EmptyState, ProgressBar, Spinner } from '../components/ui';

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

  const {
    refineMutation,
    limitModalVisible: refineLimitModalVisible,
    limitModalMessage: refineLimitModalMessage,
    dismissLimitModal: dismissRefineLimitModal,
  } = useRefinePlan(navigation, planId);
  const [refineModalVisible, setRefineModalVisible] = useState(false);
  // Tracks which refinement id we've already alerted on, so a failed
  // attempt surfaces its "didn't take" alert once per attempt rather than
  // re-firing every time this query refetches.
  const alertedRefinementIdRef = useRef<number | null>(null);

  useEffect(() => {
    const latest = plan?.latest_refinement;
    if (latest?.status === 'failed' && alertedRefinementIdRef.current !== latest.id) {
      alertedRefinementIdRef.current = latest.id;
      Alert.alert('Refinement failed', "We couldn't apply your changes — your plan wasn't affected. Please try again.");
    }
  }, [plan?.latest_refinement]);

  const handleRefineSubmit = ({ tags, notes }: { tags: RefinementTag[]; notes: string }) => {
    if (!requireOnline('refine this plan')) return;
    setRefineModalVisible(false);
    refineMutation.mutate({
      ...(tags.length > 0 ? { tags } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    });
  };

  const shareMutation = useMutation({
    mutationFn: () => sharePlan(planId),
    // The web URL, not the bare masterit:// scheme — this resolves for a
    // recipient whether or not they have the app installed (it lands on the
    // backend's own redirect-then-fallback page), where the raw scheme
    // would just silently fail to open for anyone without the app.
    onSuccess: (token) => {
      const url = `${process.env.EXPO_PUBLIC_API_URL}/plans/shared/${token}`;
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
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setRefineModalVisible(true)}
            disabled={refineMutation.isPending}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="sparkles-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
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
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, plan?.status, shareMutation.isPending, refineMutation.isPending, colors]);

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

  const completedCount = plan?.steps.filter((step) => step.completed_at).length ?? 0;
  const totalSteps = plan?.steps.length ?? 0;
  const progressRatio = totalSteps > 0 ? completedCount / totalSteps : 0;

  if (isLoading || !plan) {
    if (!isOnline) {
      return (
        <EmptyState icon="cloud-offline-outline" message="Can't load this plan — you're offline and haven't opened it before." />
      );
    }
    return <Spinner fullScreen />;
  }

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
            {completed && <Ionicons name="checkmark" size={14} color={colors.background} />}
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
      <PlanLimitModal
        visible={refineLimitModalVisible}
        message={refineLimitModalMessage}
        onDismiss={dismissRefineLimitModal}
      />
      <RefinePlanModal
        visible={refineModalVisible}
        isSubmitting={refineMutation.isPending}
        onSubmit={handleRefineSubmit}
        onDismiss={() => setRefineModalVisible(false)}
      />
      <View style={styles.header}>
        <Text style={styles.planTitle}>{plan.title}</Text>
        <Text style={styles.progress}>
          {completedCount} of {plan.steps.length} steps complete
        </Text>
        <ProgressBar ratio={progressRatio} animateOnMount style={styles.progressTrack} />
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
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    header: { padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
    planTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    progress: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    progressTrack: { marginTop: 10 },
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
    checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    stepContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    stepText: { flex: 1 },
    stepTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    stepTitleDone: { textDecorationLine: 'line-through', color: colors.textPlaceholder },
    stepDescription: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    stepDueDate: { fontSize: 12, color: colors.textPlaceholder, marginTop: 4 },
  });
