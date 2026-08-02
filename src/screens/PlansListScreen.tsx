import React, { useMemo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listPlans, setPlanComplete } from '../api/plans';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

export function PlansListScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Keyed by plan id so the swiped-open row can be closed by the button
  // press that triggers its own action, without closing every other row.
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  const {
    data: plans,
    isLoading,
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

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>You haven't created any plans yet.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Plan }) => {
    const isCompleted = Boolean(item.completed_at);
    const allStepsComplete =
      item.status === 'ready' && item.steps.length > 0 && item.steps.every((s) => s.completed_at);
    const showComplete = isCompleted || allStepsComplete;

    const closeSwipeable = () => swipeableRefs.current.get(item.id)?.close();

    const renderRightActions = () => (
      <TouchableOpacity
        style={[styles.swipeAction, isCompleted ? styles.swipeActionUndo : styles.swipeActionComplete]}
        onPress={() => {
          completeMutation.mutate({ planId: item.id, completed: !isCompleted });
          closeSwipeable();
        }}
      >
        <Ionicons name={isCompleted ? 'arrow-undo' : 'checkmark'} size={22} color={colors.background} />
        <Text style={styles.swipeActionText}>{isCompleted ? 'Undo' : 'Complete'}</Text>
      </TouchableOpacity>
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
          </View>
          {showComplete && (
            <Ionicons name="checkmark-circle" size={24} color={colors.success} style={styles.completeIcon} />
          )}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <FlatList
      data={plans}
      keyExtractor={(plan) => String(plan.id)}
      contentContainerStyle={styles.list}
      renderItem={renderItem}
      refreshing={isRefetching}
      onRefresh={refetch}
    />
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
    emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
    list: { padding: 20, flexGrow: 1, backgroundColor: colors.background },
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
    swipeAction: {
      width: 96,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swipeActionComplete: { backgroundColor: colors.success },
    swipeActionUndo: { backgroundColor: colors.textMuted },
    swipeActionText: { color: colors.background, fontSize: 12, fontWeight: '600', marginTop: 4 },
  });
