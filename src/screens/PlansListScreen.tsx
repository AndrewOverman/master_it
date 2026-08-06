import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listPlans, setPlanComplete, resetPlanProgress } from '../api/plans';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline, useRequireOnline } from '../lib/offline';
import { formatRelativeTime } from '../utils/relativeTime';
import { PlanCompleteOverlay } from '../components/PlanCompleteOverlay';
import { EmptyState, ProgressBar, Spinner } from '../components/ui';
import { shadows } from '../theme/shadows';

export function PlansListScreen({ navigation, route }: any) {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = useIsOnline();
  const requireOnline = useRequireOnline();
  const insets = useSafeAreaInsets();
  // Keyed by plan id so the swiped-open row can be closed by the button
  // press that triggers its own action, without closing every other row.
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());
  const [showCelebration, setShowCelebration] = useState(false);

  // PlanDetailScreen navigates here with `celebrate: true` when the last
  // step of a plan is checked off. Clear the param right away so it doesn't
  // re-fire on a later focus (e.g. coming back via the drawer).
  useEffect(() => {
    if (route.params?.celebrate) {
      setShowCelebration(true);
      navigation.setParams({ celebrate: undefined });
    }
  }, [route.params?.celebrate, navigation]);

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
  });

  const newPlanFab = (
    <TouchableOpacity
      style={[styles.fab, { bottom: insets.bottom + 20 }]}
      onPress={() => navigation.navigate('NewPlan')}
      accessibilityLabel="Create plan"
    >
      <Ionicons name="add" size={22} color={colors.background} />
      <Text style={styles.fabLabel}>Create Plan</Text>
    </TouchableOpacity>
  );

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
        <EmptyState message="You haven't created any plans yet." />
        {newPlanFab}
      </View>
    );
  }

  const syncedLabel = formatRelativeTime(dataUpdatedAt);

  const renderItem = ({ item }: { item: Plan }) => {
    const isCompleted = Boolean(item.completed_at);
    const allStepsComplete =
      item.status === 'ready' && item.steps.length > 0 && item.steps.every((s) => s.completed_at);
    const showComplete = isCompleted || allStepsComplete;

    const closeSwipeable = () => swipeableRefs.current.get(item.id)?.close();

    const handleReset = () => {
      closeSwipeable();
      if (!requireOnline("reset a plan's progress")) return;
      Alert.alert(
        'Reset progress?',
        `This will mark all of "${item.title}"'s steps as incomplete. This can't be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: () => resetMutation.mutate(item.id),
          },
        ]
      );
    };

    const renderRightActions = () => (
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity style={[styles.swipeAction, styles.swipeActionReset]} onPress={handleReset}>
          <Ionicons name="refresh" size={22} color={colors.background} />
          <Text style={styles.swipeActionText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeAction, isCompleted ? styles.swipeActionUndo : styles.swipeActionComplete]}
          onPress={() => {
            closeSwipeable();
            if (!requireOnline('mark a plan complete')) return;
            completeMutation.mutate({ planId: item.id, completed: !isCompleted });
          }}
        >
          <Ionicons name={isCompleted ? 'arrow-undo' : 'checkmark'} size={22} color={colors.background} />
          <Text style={styles.swipeActionText}>{isCompleted ? 'Undo' : 'Complete'}</Text>
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
          onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}
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
            <Text style={styles.planMeta}>
              {item.status === 'ready'
                ? `${item.steps.filter((s) => s.completed_at).length}/${item.steps.length} steps complete`
                : item.status}
            </Text>
            {item.status === 'ready' && item.steps.length > 0 && (
              <ProgressBar
                ratio={item.steps.filter((s) => s.completed_at).length / item.steps.length}
                style={styles.rowProgressTrack}
              />
            )}
          </View>
          {showComplete && (
            <Ionicons name="checkmark-circle" size={24} color={colors.success} style={styles.completeIcon} />
          )}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={plans}
        keyExtractor={(plan) => String(plan.id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        renderItem={renderItem}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListHeaderComponent={
          !isOnline ? (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
              <Text style={styles.offlineBannerText}>
                You're offline{syncedLabel ? ` — synced ${syncedLabel}` : ''}. Editing is disabled until you're back online.
              </Text>
            </View>
          ) : null
        }
      />
      {newPlanFab}
      <PlanCompleteOverlay visible={showCelebration} onDismiss={() => setShowCelebration(false)} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    fab: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 52,
      paddingHorizontal: 22,
      borderRadius: 26,
      backgroundColor: colors.accent,
      ...shadows.fab,
    },
    fabLabel: { color: colors.background, fontSize: 15, fontWeight: '600' },
    list: { padding: 20, flexGrow: 1, backgroundColor: colors.background },
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.surfaceMuted,
      marginBottom: 16,
    },
    offlineBannerText: { flex: 1, fontSize: 12.5, color: colors.textMuted },
    planRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderMuted,
    },
    planImage: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    planEmoji: { fontSize: 24 },
    planText: { flex: 1 },
    planTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    planTitleDone: { textDecorationLine: 'line-through', color: colors.textPlaceholder },
    completeIcon: { marginLeft: 10 },
    planMeta: { fontSize: 13, color: colors.textMuted, marginTop: 4, textTransform: 'capitalize' },
    rowProgressTrack: { marginTop: 8 },
    swipeAction: {
      width: 96,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swipeActionComplete: { backgroundColor: colors.success },
    swipeActionUndo: { backgroundColor: colors.textMuted },
    swipeActionReset: { backgroundColor: colors.destructive },
    swipeActionText: { color: colors.background, fontSize: 12, fontWeight: '600', marginTop: 4 },
  });
