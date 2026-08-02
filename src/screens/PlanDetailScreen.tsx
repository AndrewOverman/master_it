import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlan, setStepComplete, getRelatedPlans } from '../api/plans';
import { useCopyPlan } from '../hooks/useCopyPlan';
import { PlanCard } from '../components/PlanCard';
import type { Plan, PlanStep } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

export function PlanDetailScreen({ route, navigation }: any) {
  const { planId } = route.params;
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId),
  });

  // Independent of the query above — the backend reads the current
  // plan's prompt itself via the route-bound model, so this doesn't
  // need to wait on `plan` to load first.
  const { data: relatedPlans } = useQuery({
    queryKey: ['plan', planId, 'related'],
    queryFn: () => getRelatedPlans(planId),
  });

  const { copyMutation, handleCopyPress } = useCopyPlan(navigation);

  const toggleMutation = useMutation({
    mutationFn: ({ stepId, completed }: { stepId: number; completed: boolean }) =>
      setStepComplete(planId, stepId, completed),
    // Optimistic update so checking a step feels instant
    onMutate: async ({ stepId, completed }) => {
      await queryClient.cancelQueries({ queryKey: ['plan', planId] });
      const previousPlan = queryClient.getQueryData<Plan>(['plan', planId]);

      queryClient.setQueryData<Plan>(['plan', planId], (old) =>
        old
          ? {
              ...old,
              steps: old.steps.map((step) =>
                step.id === stepId
                  ? { ...step, completed_at: completed ? new Date().toISOString() : null }
                  : step
              ),
            }
          : old
      );

      return { previousPlan };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousPlan) {
        queryClient.setQueryData(['plan', planId], context.previousPlan);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', planId] });
    },
  });

  if (isLoading || !plan) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  const completedCount = plan.steps.filter((step) => step.completed_at).length;

  const renderStep = ({ item }: { item: PlanStep }) => {
    const completed = Boolean(item.completed_at);

    return (
      <View style={styles.stepRow}>
        <TouchableOpacity
          style={styles.checkboxTouchable}
          onPress={() => toggleMutation.mutate({ stepId: item.id, completed: !completed })}
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
            {item.due_date && <Text style={styles.stepDueDate}>Due {item.due_date}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.border} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.planTitle}>{plan.title}</Text>
        <Text style={styles.progress}>
          {completedCount} of {plan.steps.length} steps complete
        </Text>
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
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    header: { padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
    planTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    progress: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
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
    stepContent: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
    stepText: { flex: 1 },
    stepTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    stepTitleDone: { textDecorationLine: 'line-through', color: colors.textPlaceholder },
    stepDescription: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    stepDueDate: { fontSize: 12, color: colors.textPlaceholder, marginTop: 4 },
  });
