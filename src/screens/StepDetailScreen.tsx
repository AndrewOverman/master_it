import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Platform,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import YoutubeIframe from 'react-native-youtube-iframe';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStep, setStepDueDate } from '../api/plans';
import type { Plan, PlanStep } from '../types/plan';

// Same DOM-escape-hatch trick used in PlanDetailScreen — see the comment
// there for why this is the reliable cross-platform way to get these.
const WebDateInput = 'input' as any;
const WebIframe = 'iframe' as any;

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

export function StepDetailScreen({ route, navigation }: any) {
  const { planId, stepId } = route.params;
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const videoPlayerWidth = windowWidth - 40;

  const { data: step, isLoading } = useQuery({
    queryKey: ['plan', planId, 'step', stepId],
    queryFn: () => getStep(planId, stepId),
  });

  useEffect(() => {
    if (step) {
      navigation.setOptions({ title: step.title });
    }
  }, [step, navigation]);

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const dueDateMutation = useMutation({
    mutationFn: (dueDate: string) => setStepDueDate(planId, stepId, dueDate),
    onMutate: async (dueDate: string) => {
      await queryClient.cancelQueries({ queryKey: ['plan', planId, 'step', stepId] });
      await queryClient.cancelQueries({ queryKey: ['plan', planId] });

      const previousStep = queryClient.getQueryData<PlanStep>(['plan', planId, 'step', stepId]);
      const previousPlan = queryClient.getQueryData<Plan>(['plan', planId]);

      queryClient.setQueryData<PlanStep>(['plan', planId, 'step', stepId], (old) =>
        old ? { ...old, due_date: dueDate } : old
      );
      queryClient.setQueryData<Plan>(['plan', planId], (old) =>
        old
          ? {
              ...old,
              steps: old.steps.map((s) => (s.id === stepId ? { ...s, due_date: dueDate } : s)),
            }
          : old
      );

      return { previousStep, previousPlan };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousStep) {
        queryClient.setQueryData(['plan', planId, 'step', stepId], context.previousStep);
      }
      if (context?.previousPlan) {
        queryClient.setQueryData(['plan', planId], context.previousPlan);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', planId, 'step', stepId] });
      queryClient.invalidateQueries({ queryKey: ['plan', planId] });
    },
  });

  const commitDueDate = (date: Date) => {
    dueDateMutation.mutate(formatDateInput(date));
    setIsEditingDate(false);
    setPendingDate(null);
  };

  const openDateEditor = () => {
    setPendingDate(step?.due_date ? new Date(`${step.due_date}T00:00:00`) : new Date());
    setIsEditingDate(true);
  };

  if (isLoading || !step) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  const videoId = step.video_url ? getYouTubeVideoId(step.video_url) : null;
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1` : null;
  const resources = step.resources ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.description}>{step.description}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Due date</Text>
        <TouchableOpacity style={styles.dueDateRow} onPress={openDateEditor}>
          <Ionicons name="calendar-outline" size={16} color="#6B7280" />
          <Text style={styles.dueDateText}>{step.due_date ? `Due ${step.due_date}` : 'Set a due date'}</Text>
          <Ionicons name="pencil" size={14} color="#9CA3AF" style={styles.dueDateEditIcon} />
        </TouchableOpacity>

        {isEditingDate && Platform.OS !== 'web' && (
          <View style={styles.datePickerRow}>
            <DateTimePicker
              value={pendingDate ?? new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event: any, selectedDate?: Date) => {
                if (Platform.OS === 'android') {
                  setIsEditingDate(false);
                  if (event.type === 'set' && selectedDate) {
                    commitDueDate(selectedDate);
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
                onPress={() => pendingDate && commitDueDate(pendingDate)}
              >
                <Text style={styles.datePickerDoneText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isEditingDate && Platform.OS === 'web' && (
          <WebDateInput
            type="date"
            value={step.due_date ?? ''}
            autoFocus
            onChange={(e: any) => {
              const value = e.target.value;
              setIsEditingDate(false);
              if (value) {
                dueDateMutation.mutate(value);
              }
            }}
            onBlur={() => setIsEditingDate(false)}
            style={styles.webDateInput}
          />
        )}
      </View>

      {(thumbnailUrl || embedUrl) && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Video</Text>
          {thumbnailUrl && !isPlaying && (
            <TouchableOpacity style={styles.videoThumbnail} onPress={() => setIsPlaying(true)} activeOpacity={0.85}>
              <Image source={{ uri: thumbnailUrl }} style={styles.videoImage} />
              <View style={styles.videoPlayOverlay}>
                <Ionicons name="play-circle" size={40} color="#ffffff" />
              </View>
              <Text style={styles.videoLabel}>{step.video_title ?? 'Watch video'}</Text>
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
                <YoutubeIframe
                  videoId={videoId!}
                  width={videoPlayerWidth}
                  height={videoPlayerWidth * (9 / 16)}
                  play
                />
              )}
              <TouchableOpacity
                style={styles.videoCloseButton}
                onPress={() => setIsPlaying(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={26} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Resources</Text>
        {resources.length === 0 ? (
          <Text style={styles.noResourcesText}>No resources found for this step yet.</Text>
        ) : (
          resources.map((resource) => (
            <TouchableOpacity
              key={resource.id}
              style={styles.resourceCard}
              onPress={() => Linking.openURL(resource.url)}
              activeOpacity={0.7}
            >
              <View style={styles.resourceCardHeader}>
                <Text style={styles.resourceTitle} numberOfLines={2}>
                  {resource.title}
                </Text>
                <Ionicons name="open-outline" size={16} color="#9CA3AF" />
              </View>
              {resource.source && <Text style={styles.resourceSource}>{resource.source}</Text>}
              {resource.description && <Text style={styles.resourceDescription}>{resource.description}</Text>}
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  description: { fontSize: 15, color: '#374151', marginTop: 10, lineHeight: 21 },
  section: { marginTop: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 10 },
  dueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignSelf: 'flex-start',
  },
  dueDateText: { fontSize: 14, color: '#374151', marginLeft: 8 },
  dueDateEditIcon: { marginLeft: 8 },
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
  noResourcesText: { fontSize: 14, color: '#9CA3AF' },
  resourceCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  resourceCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  resourceTitle: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  resourceSource: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  resourceDescription: { fontSize: 13, color: '#6B7280', marginTop: 6, lineHeight: 18 },
});
