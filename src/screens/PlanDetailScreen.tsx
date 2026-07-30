import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Platform,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import YoutubeIframe from 'react-native-youtube-iframe';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPlan, setStepComplete, setStepDueDate } from '../api/plans';
import type { Plan, PlanStep } from '../types/plan';

// react-native-web has no native <input>, but Metro still bundles a raw
// DOM tag string on the web target — the only reliable cross-platform way
// to get a real date input on web, since the native picker module doesn't
// have a web build.
const WebDateInput = 'input' as any;
// Same trick for an embedded video player on web, sidestepping whatever
// web support react-native-webview does or doesn't have.
const WebIframe = 'iframe' as any;

// Extracts the 11-char YouTube video id from a watch/share link.
function getYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Formats a Date using its local fields (not .toISOString(), which shifts
// to UTC and can land on the wrong day near midnight).
function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function PlanDetailScreen({ route }: any) {
  const { planId } = route.params;
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  // list padding (20*2) + checkbox column (24 width + 14 margin)
  const videoPlayerWidth = windowWidth - 78;

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

  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [playingStepId, setPlayingStepId] = useState<number | null>(null);

  const dueDateMutation = useMutation({
    mutationFn: ({ stepId, dueDate }: { stepId: number; dueDate: string }) =>
      setStepDueDate(planId, stepId, dueDate),
    onMutate: async ({ stepId, dueDate }) => {
      await queryClient.cancelQueries({ queryKey: ['plan', planId] });
      const previousPlan = queryClient.getQueryData<Plan>(['plan', planId]);

      queryClient.setQueryData<Plan>(['plan', planId], (old) =>
        old
          ? {
              ...old,
              steps: old.steps.map((step) =>
                step.id === stepId ? { ...step, due_date: dueDate } : step
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

  const commitDueDate = (stepId: number, date: Date) => {
    dueDateMutation.mutate({ stepId, dueDate: formatDateInput(date) });
    setEditingStepId(null);
    setPendingDate(null);
  };

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
    const videoId = item.video_url ? getYouTubeVideoId(item.video_url) : null;
    const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
    const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1` : null;
    const isPlaying = playingStepId === item.id;

    return (
      <View style={styles.stepRow}>
        {/* Separate touchable from the video/due-date area below — a
            WebView sibling doesn't reliably block touch bubbling to a
            parent TouchableOpacity the way nested RN touchables do, so
            the toggle target must not visually contain the video at all. */}
        <TouchableOpacity
          style={styles.stepToggleRow}
          onPress={() => toggleMutation.mutate({ stepId: item.id, completed: !completed })}
        >
          <View style={[styles.checkbox, completed && styles.checkboxChecked]}>
            {completed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <View style={styles.stepText}>
            <Text style={[styles.stepTitle, completed && styles.stepTitleDone]}>{item.title}</Text>
            <Text style={styles.stepDescription}>{item.description}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.stepExtras}>
          {item.due_date && (
            <TouchableOpacity
              style={styles.dueDateRow}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              onPress={() => {
                setEditingStepId(item.id);
                setPendingDate(new Date(`${item.due_date}T00:00:00`));
              }}
            >
              <Text style={styles.stepDueDate}>Due {item.due_date}</Text>
              <Ionicons name="pencil" size={12} color="#9CA3AF" style={styles.dueDateEditIcon} />
            </TouchableOpacity>
          )}

          {editingStepId === item.id && Platform.OS !== 'web' && (
            <View style={styles.datePickerRow}>
              <DateTimePicker
                value={pendingDate ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event: any, selectedDate?: Date) => {
                  if (Platform.OS === 'android') {
                    setEditingStepId(null);
                    if (event.type === 'set' && selectedDate) {
                      commitDueDate(item.id, selectedDate);
                    }
                    setPendingDate(null);
                  } else if (selectedDate) {
                    setPendingDate(selectedDate);
                  }
                }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.datePickerDoneButton}
                  onPress={() => pendingDate && commitDueDate(item.id, pendingDate)}
                >
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {editingStepId === item.id && Platform.OS === 'web' && (
            <WebDateInput
              type="date"
              value={item.due_date}
              autoFocus
              onChange={(e: any) => {
                const value = e.target.value;
                setEditingStepId(null);
                if (value) {
                  dueDateMutation.mutate({ stepId: item.id, dueDate: value });
                }
              }}
              onBlur={() => setEditingStepId(null)}
              style={styles.webDateInput}
            />
          )}

          {thumbnailUrl && !isPlaying && (
            <TouchableOpacity
              style={styles.videoThumbnail}
              onPress={() => setPlayingStepId(item.id)}
              activeOpacity={0.85}
            >
              <Image source={{ uri: thumbnailUrl }} style={styles.videoImage} />
              <View style={styles.videoPlayOverlay}>
                <Ionicons name="play-circle" size={40} color="#ffffff" />
              </View>
              <Text style={styles.videoLabel}>Watch video</Text>
            </TouchableOpacity>
          )}

          {embedUrl && isPlaying && (
            <View style={styles.videoPlayer}>
              {Platform.OS === 'web' ? (
                <WebIframe
                  src={embedUrl}
                  style={styles.videoPlayerFrame}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              ) : (
                // A hand-rolled WebView pointed at the embed URL (or even
                // wrapped in local HTML) trips YouTube's origin check
                // (Error 153) — this library loads a properly-hosted
                // helper page instead, which YouTube accepts.
                <YoutubeIframe
                  videoId={videoId!}
                  width={videoPlayerWidth}
                  height={videoPlayerWidth * (9 / 16)}
                  play
                />
              )}
              <TouchableOpacity
                style={styles.videoCloseButton}
                onPress={() => setPlayingStepId(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={26} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
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
  stepRow: { marginBottom: 20 },
  stepToggleRow: { flexDirection: 'row' },
  stepExtras: { marginLeft: 38 },
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
  dueDateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  stepDueDate: { fontSize: 12, color: '#9CA3AF' },
  dueDateEditIcon: { marginLeft: 6 },
  datePickerRow: { marginTop: 8 },
  datePickerDoneButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  datePickerDoneText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  webDateInput: {
    marginTop: 8,
    fontSize: 14,
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  videoThumbnail: {
    marginTop: 12,
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  videoImage: { width: '100%', height: '100%', backgroundColor: '#E5E7EB' },
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  videoLabel: { fontSize: 12, fontWeight: '600', color: '#374151', paddingVertical: 8, paddingHorizontal: 10 },
  videoPlayer: {
    marginTop: 12,
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  videoPlayerFrame: { flex: 1 },
  videoCloseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
