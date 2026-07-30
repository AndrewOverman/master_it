import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, Linking, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlan, setStepComplete } from '../api/plans';
import type { Plan, PlanStep } from '../types/plan';

// Derives a YouTube thumbnail image URL from a watch/share link.
function getYouTubeThumbnail(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

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
    const thumbnailUrl = item.video_url ? getYouTubeThumbnail(item.video_url) : null;

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

          {thumbnailUrl && (
            <TouchableOpacity
              style={styles.videoThumbnail}
              onPress={() => Linking.openURL(item.video_url!)}
              activeOpacity={0.85}
            >
              <Image source={{ uri: thumbnailUrl }} style={styles.videoImage} />
              <View style={styles.videoPlayOverlay}>
                <Ionicons name="play-circle" size={40} color="#ffffff" />
              </View>
              <Text style={styles.videoLabel}>Watch video</Text>
            </TouchableOpacity>
          )}
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
  videoThumbnail: {
    marginTop: 12,
    width: 220,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  videoImage: { width: '100%', height: 124, backgroundColor: '#E5E7EB' },
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  videoLabel: { fontSize: 12, fontWeight: '600', color: '#374151', paddingVertical: 8, paddingHorizontal: 10 },
});
