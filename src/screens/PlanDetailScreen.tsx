import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPlan, getRelatedPlans, sharePlan } from '../api/plans';
import { useRefinePlan } from '../hooks/useRefinePlan';
import { useToggleStep } from '../hooks/useToggleStep';
import { PlanCompleteOverlay } from '../components/PlanCompleteOverlay';
import { PlanCard } from '../components/PlanCard';
import { PlanLimitModal } from '../components/PlanLimitModal';
import { RefinePlanModal } from '../components/RefinePlanModal';
import type { PlanStep, RefinementTag } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline, useRequireOnline } from '../lib/offline';
import { formatRelativeTime } from '../utils/relativeTime';
import { formatDueDate } from '../utils/dueDate';
import { ActionSheet, EmptyState, OfflineNotice, ProgressBar, Spinner, type SheetAction } from '../components/ui';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

export function PlanDetailScreen({ route, navigation }: any) {
  const { planId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = useIsOnline();
  const requireOnline = useRequireOnline();

  const {
    data: plan,
    isLoading,
    dataUpdatedAt,
    refetch,
    isRefetching,
  } = useQuery({
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

  const {
    refineMutation,
    limitModalVisible: refineLimitModalVisible,
    limitModalMessage: refineLimitModalMessage,
    dismissLimitModal: dismissRefineLimitModal,
  } = useRefinePlan(navigation, planId);
  const [refineModalVisible, setRefineModalVisible] = useState(false);
  // Whether the refine modal has finished leaving the screen. Submitting can
  // be answered with the generation-limit modal, and on iOS that one is
  // dropped outright if it tries to present while the refine modal is still
  // dismissing — a 429 off a nearby server can beat the fade out. Gating on
  // this holds the limit modal back until there's room for it, the same rule
  // ActionSheet follows for its own actions (see useOnModalHidden).
  const [refineModalHidden, setRefineModalHidden] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
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

  // One labelled menu rather than bare header glyphs. Refine rewrites every
  // step and resets progress, so it needs a control that says what it does —
  // an unlabelled one-tap icon is the wrong amount of friction for an action
  // that consequential. Share costs a tap for the same benefit.
  //
  // Only a finished plan is shareable or refinable (mirrors the backend's own
  // gates), so the menu only appears once ready.
  useLayoutEffect(() => {
    if (plan?.status !== 'ready') {
      navigation.setOptions({ headerRight: undefined });
      return;
    }
    navigation.setOptions({
      headerRight: () =>
        shareMutation.isPending ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : (
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Plan actions"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, plan?.status, shareMutation.isPending, colors]);

  const menuActions: SheetAction[] = [
    {
      label: 'Share plan',
      icon: 'share-outline',
      onPress: () => {
        setMenuVisible(false);
        handleSharePress();
      },
    },
    {
      label: 'Refine plan',
      icon: 'sparkles-outline',
      onPress: () => {
        setMenuVisible(false);
        setRefineModalHidden(false);
        setRefineModalVisible(true);
      },
    },
  ];

  const [celebratingPlanId, setCelebratingPlanId] = useState<number | null>(null);
  const { toggleStep } = useToggleStep(planId, setCelebratingPlanId);

  const completedCount = plan?.steps.filter((step) => step.completed_at).length ?? 0;
  const totalSteps = plan?.steps.length ?? 0;
  const progressRatio = totalSteps > 0 ? completedCount / totalSteps : 0;
  // Drives the "plan complete" banner only — steps stay editable either way,
  // so a mis-tap on the last one costs a second tap rather than the plan.
  const isPlanComplete = totalSteps > 0 && completedCount === totalSteps;

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
    const due = item.due_date ? formatDueDate(item.due_date) : null;
    // A finished step can't be late — flagging it red would just be nagging
    // about something the user already did.
    const showOverdue = due?.isOverdue && !completed;

    return (
      <View style={styles.stepRow}>
        <TouchableOpacity
          style={styles.checkboxTouchable}
          accessibilityRole="checkbox"
          accessibilityLabel={item.title}
          accessibilityState={{ checked: completed }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => {
            if (!requireOnline('check off a step')) return;
            toggleStep({ stepId: item.id, completed: !completed });
          }}
        >
          <View style={[styles.checkbox, completed && styles.checkboxChecked]}>
            {completed && <Ionicons name="checkmark" size={14} color={colors.background} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.stepContent}
          onPress={() => navigation.navigate('StepDetail', { planId, stepId: item.id })}
          accessibilityRole="button"
          accessibilityLabel={`Open step: ${item.title}`}
        >
          <View style={styles.stepText}>
            <Text style={[styles.stepTitle, completed && styles.stepTitleDone]}>{item.title}</Text>
            <Text style={styles.stepDescription} numberOfLines={2}>
              {item.description}
            </Text>
            {due && (
              <Text style={[styles.stepDueDate, showOverdue && styles.stepDueDateOverdue]}>
                {showOverdue ? `Due ${due.text}` : `Aiming for ${due.text}`}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <PlanLimitModal
        visible={refineLimitModalVisible && refineModalHidden}
        title="Out of plan generations"
        message={refineLimitModalMessage}
        onUpgrade={() => {
          // Dismiss before navigating, or the paywall stacks on top of this
          // modal and closing it reveals the limit modal again behind.
          dismissRefineLimitModal();
          navigation.navigate('Paywall', { source: 'refine_limit' });
        }}
        onDismiss={dismissRefineLimitModal}
      />
      <RefinePlanModal
        visible={refineModalVisible}
        isSubmitting={refineMutation.isPending}
        completedSteps={completedCount}
        onSubmit={handleRefineSubmit}
        onDismiss={() => setRefineModalVisible(false)}
        onHidden={() => setRefineModalHidden(true)}
      />
      {/* Celebrated right here, on the screen where the user finished the
          plan, rather than navigating them somewhere else to see it. */}
      <ActionSheet
        visible={menuVisible}
        title={plan.title}
        actions={menuActions}
        onDismiss={() => setMenuVisible(false)}
      />
      <PlanCompleteOverlay
        visible={celebratingPlanId !== null}
        planId={celebratingPlanId}
        onDismiss={() => setCelebratingPlanId(null)}
      />
      <View style={styles.header}>
        <Text style={styles.planTitle}>{plan.title}</Text>
        <Text style={styles.progress}>
          {completedCount} of {plan.steps.length} steps complete
        </Text>
        <ProgressBar
          ratio={progressRatio}
          animateOnMount
          style={styles.progressTrack}
          label="Plan progress"
          valueText={`${completedCount} of ${plan.steps.length} steps complete`}
        />
        {isPlanComplete && (
          <View style={styles.completeRow}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.completeText}>
              Plan complete — nice work. Uncheck any step to pick it back up.
            </Text>
          </View>
        )}
        {/* The other kind of "done": the user closed this plan out without
            finishing every step. Worth saying so, since the checklist below
            still shows unchecked items and would otherwise look untouched. */}
        {Boolean(plan.completed_at) && !isPlanComplete && (
          <View style={styles.completeRow}>
            <Ionicons name="flag" size={14} color={colors.textMuted} />
            <Text style={styles.completeText}>
              You marked this plan done. Its steps are still yours to check off.
            </Text>
          </View>
        )}
        {!isOnline && (
          <OfflineNotice syncedLabel={syncedLabel} style={styles.offlineNotice} />
        )}
      </View>
      <FlatList
        data={[...plan.steps].sort((a, b) => a.order - b.order)}
        keyExtractor={(step) => String(step.id)}
        renderItem={renderStep}
        contentContainerStyle={styles.list}
        // This is the screen most likely to be stale — steps can be checked
        // off from Today, and a plan can be refined or reset from the list —
        // and it was the only main list without pull-to-refresh.
        refreshing={isRefetching}
        onRefresh={refetch}
        ListFooterComponent={
          relatedPlans && relatedPlans.length > 0 ? (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedTitle}>Related Plans</Text>
              {relatedPlans.map((related) => (
                <PlanCard
                  key={related.id}
                  plan={related}
                  // Preview lives in the Explore stack, so this crosses tabs
                  // rather than pushing a second copy of it here — same rule
                  // the other direction already follows for copied plans.
                  onPress={() =>
                    navigation.navigate('Explore', {
                      screen: 'FeaturedPlan',
                      params: { planId: related.id },
                    })
                  }
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
    header: { padding: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
    planTitle: { fontSize: typography.h2.fontSize, fontWeight: '700', color: colors.textPrimary },
    progress: { fontSize: typography.caption.fontSize, color: colors.textMuted, marginTop: spacing.xxs },
    progressTrack: { marginTop: 10 },
    completeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
    completeText: { flex: 1, fontSize: typography.small.fontSize, color: colors.textMuted },
    offlineNotice: { marginTop: spacing.sm, marginBottom: 0 },
    list: { padding: spacing.lg },
    relatedSection: { marginTop: spacing.sm, paddingTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.borderMuted },
    relatedTitle: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
    checkboxTouchable: { paddingTop: 2 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    stepContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    stepText: { flex: 1 },
    stepTitle: { fontSize: typography.body.fontSize, fontWeight: '600', color: colors.textPrimary },
    stepTitleDone: { textDecorationLine: 'line-through', color: colors.textPlaceholder },
    stepDescription: { fontSize: typography.label.fontSize, color: colors.textMuted, marginTop: spacing.xxs },
    stepDueDate: { fontSize: typography.small.fontSize, color: colors.textPlaceholder, marginTop: spacing.xxs },
    stepDueDateOverdue: { color: colors.destructive, fontWeight: '600' },
  });
