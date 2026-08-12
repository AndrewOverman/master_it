import { useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listPlans, setPlanComplete, resetPlanProgress } from '../api/plans';
import type { Plan, PlanStatus } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline, useRequireOnline } from '../lib/offline';
import { formatRelativeTime } from '../utils/relativeTime';
import { CreatePlanFab } from '../components/CreatePlanFab';
import { ActionSheet, EmptyState, OfflineNotice, ProgressBar, Spinner, type SheetAction } from '../components/ui';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

// A plan that isn't 'ready' has no progress to report, so the meta line
// carries its state instead. Written out rather than printing the raw enum
// ("generating", "failed") — and each one names what the user can do next,
// since every non-ready row is tappable through to a screen that acts on it.
const STATUS_LABELS: Record<Exclude<PlanStatus, 'ready'>, string> = {
  generating: 'Building your plan…',
  failed: "Couldn't be built — tap to try again",
  rejected: "We couldn't build this one",
};

// A plan carries two independent notions of "done", and the row has to
// distinguish them rather than badging both the same way:
//   - every step checked off  — the work actually got finished
//   - completed_at set        — the user declared the plan finished, which
//                               they can do at any point, steps or no steps
// They usually agree. When they don't, the row has to say so, otherwise
// "6/6 steps complete" sitting under a menu offering "Mark as complete"
// reads as a contradiction.
function completionMeta(plan: Plan): string {
  const done = plan.steps.filter((step) => step.completed_at).length;
  const total = plan.steps.length;
  const allStepsDone = total > 0 && done === total;
  const markedDone = Boolean(plan.completed_at);

  if (markedDone) return `Marked done · ${done} of ${total} steps complete`;
  if (allStepsDone) return `All ${total} steps complete`;
  return `${done} of ${total} steps complete`;
}

export function PlansListScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = useIsOnline();
  const requireOnline = useRequireOnline();
  // Keyed by plan id so the swiped-open row can be closed by the button
  // press that triggers its own action, without closing every other row.
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());
  // Which row's action sheet is open. The sheet renders once at screen level
  // rather than per row, so it can't be torn down by its own row re-rendering.
  const [menuPlan, setMenuPlan] = useState<Plan | null>(null);

  const {
    data: plans,
    isLoading,
    dataUpdatedAt,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  });

  const completeMutation = useMutation({
    mutationFn: ({ planId, completed }: { planId: number; completed: boolean }) =>
      setPlanComplete(planId, completed),
    // Optimistic update so swiping feels instant
    onMutate: async ({ planId, completed }) => {
      await queryClient.cancelQueries({ queryKey: ['plans'] });
      const previousPlans = queryClient.getQueryData<Plan[]>(['plans']);

      queryClient.setQueryData<Plan[]>(['plans'], (old) =>
        old?.map((plan) =>
          plan.id === planId
            ? { ...plan, completed_at: completed ? new Date().toISOString() : null }
            : plan
        )
      );

      return { previousPlans };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousPlans) {
        queryClient.setQueryData(['plans'], context.previousPlans);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (planId: number) => resetPlanProgress(planId),
    // Write the server's response straight into both caches instead of just
    // invalidating — invalidating alone leaves the plan detail screen's
    // ['plan', planId] cache stale (still showing completed steps) until its
    // own refetch resolves, which flashes the old state before correcting.
    onSuccess: (updatedPlan) => {
      queryClient.setQueryData<Plan[]>(['plans'], (old) =>
        old?.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan))
      );
      queryClient.setQueryData(['plan', updatedPlan.id], updatedPlan);
    },
    // Unlike the other mutations here there's no optimistic update to roll
    // back, so a failure would otherwise be indistinguishable from nothing
    // happening — the row just keeps showing the old progress. Reset is a
    // bulk "clear every step at once" shortcut (individual steps can always
    // be unchecked on the plan itself), and a silent no-op reads as broken.
    onError: (error: any) => {
      Alert.alert(
        "Couldn't reset this plan",
        error?.response?.data?.message ?? 'Please check your connection and try again.'
      );
    },
  });

  const confirmReset = (plan: Plan) => {
    if (!requireOnline("reset a plan's progress")) return;
    Alert.alert(
      'Reset progress?',
      `This will mark all of "${plan.title}"'s steps as incomplete. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => resetMutation.mutate(plan.id) },
      ]
    );
  };

  const menuActions: SheetAction[] = menuPlan
    ? [
        {
          // "Reopen" / "Mark plan as done", not "complete" — this toggles the
          // user's declaration, never the steps, and the wording shouldn't
          // imply otherwise on a plan that already shows every step checked.
          label: menuPlan.completed_at ? 'Reopen plan' : 'Mark plan as done',
          icon: menuPlan.completed_at ? 'arrow-undo' : 'flag-outline',
          onPress: () => {
            const plan = menuPlan;
            setMenuPlan(null);
            if (!requireOnline('mark a plan complete')) return;
            completeMutation.mutate({ planId: plan.id, completed: !plan.completed_at });
          },
        },
        {
          label: 'Reset progress',
          icon: 'refresh',
          destructive: true,
          onPress: () => {
            const plan = menuPlan;
            setMenuPlan(null);
            confirmReset(plan);
          },
        },
      ]
    : [];

  const newPlanFab = <CreatePlanFab label="Create Plan" onPress={() => navigation.navigate('NewPlan')} />;

  if (isLoading) {
    if (!isOnline) {
      return (
        <View style={styles.container}>
          <EmptyState
            icon="cloud-offline-outline"
            message="You're offline. Plans you've opened before will show up here once they're cached."
          />
          {newPlanFab}
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <Spinner fullScreen />
        {newPlanFab}
      </View>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="albums-outline"
          title="No plans yet"
          message="Tell us what you want to learn and we'll build you a step-by-step plan."
          actionLabel="Create a plan"
          onAction={() => navigation.navigate('NewPlan')}
        />
        {newPlanFab}
      </View>
    );
  }

  const syncedLabel = formatRelativeTime(dataUpdatedAt);

  const renderItem = ({ item }: { item: Plan }) => {
    const isCompleted = Boolean(item.completed_at);
    const allStepsComplete =
      item.status === 'ready' && item.steps.length > 0 && item.steps.every((s) => s.completed_at);

    const closeSwipeable = () => swipeableRefs.current.get(item.id)?.close();

    const handleToggleComplete = () => {
      if (!requireOnline('mark a plan complete')) return;
      completeMutation.mutate({ planId: item.id, completed: !isCompleted });
    };

    const handleReset = () => {
      closeSwipeable();
      confirmReset(item);
    };

    // Complete first, Reset second. Children render left-to-right, so the
    // first one sits nearest the row and is what a short swipe uncovers —
    // order matters here, because the destructive action must not be the
    // easiest to reach. Reset needs a full swipe (and still confirms).
    const renderRightActions = () => (
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity
          style={[styles.swipeAction, isCompleted ? styles.swipeActionUndo : styles.swipeActionComplete]}
          onPress={() => {
            closeSwipeable();
            handleToggleComplete();
          }}
          accessibilityRole="button"
          accessibilityLabel={
            isCompleted ? `Reopen ${item.title}` : `Mark ${item.title} done`
          }
        >
          <Ionicons name={isCompleted ? 'arrow-undo' : 'flag'} size={22} color={colors.background} />
          <Text style={styles.swipeActionText}>{isCompleted ? 'Reopen' : 'Mark done'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeAction, styles.swipeActionReset]}
          onPress={handleReset}
          accessibilityRole="button"
          accessibilityLabel={`Reset progress on ${item.title}`}
        >
          <Ionicons name="refresh" size={22} color={colors.background} />
          <Text style={styles.swipeActionText}>Reset</Text>
        </TouchableOpacity>
      </View>
    );

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(item.id, ref);
          else swipeableRefs.current.delete(item.id);
        }}
        renderRightActions={renderRightActions}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.planRow}
          accessibilityRole="button"
          // The row's own announcement, so focusing it says what the plan is
          // and where it stands instead of nothing. Descendants stay
          // individually focusable on purpose — marking the row `accessible`
          // would collapse them and take the "More actions" button with them.
          accessibilityLabel={`${item.title}. ${
            item.status === 'ready' ? completionMeta(item) : STATUS_LABELS[item.status]
          }`}
          // Only a 'ready' plan has a checklist to show. Every other status
          // would land on PlanDetail's empty step list with no explanation,
          // so each routes to the screen that can actually act on it — the
          // progress screen, or the retry/rejected screens.
          onPress={() => {
            if (item.status === 'generating') {
              navigation.navigate('Generating', { planId: item.id });
            } else if (item.status === 'failed') {
              navigation.navigate('PlanFailed', { planId: item.id, message: item.error_message });
            } else if (item.status === 'rejected') {
              navigation.navigate('PlanRejected', { planId: item.id });
            } else {
              navigation.navigate('PlanDetail', { planId: item.id });
            }
          }}
        >
          <View style={styles.planImage}>
            {item.emoji ? (
              <Text style={styles.planEmoji}>{item.emoji}</Text>
            ) : (
              <Ionicons name="image-outline" size={22} color={colors.textPlaceholder} />
            )}
          </View>
          <View style={styles.planText}>
            <Text style={[styles.planTitle, isCompleted && styles.planTitleDone]}>{item.title}</Text>
            <Text
              style={[
                styles.planMeta,
                (item.status === 'failed' || item.status === 'rejected') && styles.planMetaProblem,
              ]}
            >
              {item.status === 'ready' ? completionMeta(item) : STATUS_LABELS[item.status]}
            </Text>
            {item.status === 'ready' && item.steps.length > 0 && (
              <ProgressBar
                ratio={item.steps.filter((s) => s.completed_at).length / item.steps.length}
                style={styles.rowProgressTrack}
              />
            )}
          </View>
          {/* Green check is earned — every step is actually done. The flag
              means the user closed the plan out early, which is a different
              claim and shouldn't wear the same badge. */}
          {allStepsComplete ? (
            <Ionicons name="checkmark-circle" size={24} color={colors.success} style={styles.completeIcon} />
          ) : isCompleted ? (
            <Ionicons name="flag" size={20} color={colors.textMuted} style={styles.completeIcon} />
          ) : null}
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setMenuPlan(item)}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${item.title}`}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={plans}
        keyExtractor={(plan) => String(plan.id)}
        contentContainerStyle={styles.listWithFab}
        renderItem={renderItem}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={
          !isOnline ? (
            <OfflineNotice syncedLabel={syncedLabel} />
          ) : null
        }
      />
      {newPlanFab}
      <ActionSheet
        visible={menuPlan !== null}
        title={menuPlan?.title}
        actions={menuActions}
        onDismiss={() => setMenuPlan(null)}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // paddingBottom clears the floating FAB. No safe-area inset added — the
    // tab bar already accounts for it, and doubling up left dead space.
    listWithFab: { padding: spacing.lg, paddingBottom: 96, flexGrow: 1, backgroundColor: colors.background },
    planRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderMuted,
    },
    planImage: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    planEmoji: { fontSize: 24 },
    planText: { flex: 1 },
    planTitle: { fontSize: typography.body.fontSize, fontWeight: '600', color: colors.textPrimary },
    planTitleDone: { textDecorationLine: 'line-through', color: colors.textPlaceholder },
    completeIcon: { marginLeft: 10 },
    menuButton: { paddingLeft: spacing.sm, paddingVertical: spacing.xxs },
    planMeta: { fontSize: typography.caption.fontSize, color: colors.textMuted, marginTop: spacing.xxs },
    planMetaProblem: { color: colors.destructive },
    rowProgressTrack: { marginTop: spacing.xs },
    swipeAction: {
      width: 96,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swipeActionComplete: { backgroundColor: colors.success },
    swipeActionUndo: { backgroundColor: colors.textMuted },
    swipeActionReset: { backgroundColor: colors.destructive },
    swipeActionText: { color: colors.background, fontSize: typography.small.fontSize, fontWeight: '600', marginTop: spacing.xxs },
  });
