import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlan, setStepComplete } from '../api/plans';
import type { Plan, PlanStep } from '../types/plan';

export function PlanDetailScreen({ route }: any) {
  const { planId } = route.params;
  const queryClient = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId),
  });

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
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  const completedCount = plan.steps.filter((step) => step.completed_at).length;

  const renderStep = ({ item }: { item: PlanStep }) => {
    const completed = Boolean(item.completed_at);
    return (
      <TouchableOpacity
        style={styles.stepRow}
        onPress={() => toggleMutation.mutate({ stepId: item.id, completed: !completed })}
      >
        <View style={[styles.checkbox, completed && styles.checkboxChecked]}>
          {completed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.stepText}>
          <Text style={[styles.stepTitle, completed && styles.stepTitleDone]}>{item.title}</Text>
          <Text style={styles.stepDescription}>{item.description}</Text>
          {item.due_date && <Text style={styles.stepDueDate}>Due {item.due_date}</Text>}
        </View>
      </TouchableOpacity>
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  planTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  progress: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  list: { padding: 20 },
  stepRow: { flexDirection: 'row', marginBottom: 20 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: '#111827', borderColor: '#111827' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  stepTitleDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  stepDescription: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  stepDueDate: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
});
