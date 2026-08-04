import React, { useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline, useRequireOnline } from '../lib/offline';
import { formatRelativeTime } from '../utils/relativeTime';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = useIsOnline();
  const requireOnline = useRequireOnline();

  // The plan's own cached response already has this step's title,
  // description, due date and video info — everything except
  // `resources`, which only ever comes from getStep(). Seeding with it
  // means a step opened offline still shows that much, even if getStep
  // itself was never called for it before the connection dropped.
  const cachedPlan = queryClient.getQueryData<Plan>(['plan', planId]);
  const embeddedStep = cachedPlan?.steps.find((s) => s.id === stepId);
  const planCachedAt = queryClient.getQueryState(['plan', planId])?.dataUpdatedAt;

  const {
    data: step,
    isLoading,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['plan', planId, 'step', stepId],
    queryFn: () => getStep(planId, stepId),
    initialData: embeddedStep,
    initialDataUpdatedAt: planCachedAt,
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
    if (!requireOnline('edit a due date')) return;
    setPendingDate(step?.due_date ? new Date(`${step.due_date}T00:00:00`) : new Date());
    setIsEditingDate(true);
  };

  if (isLoading || !step) {
    if (!isOnline) {
      return (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textPlaceholder} />
          <Text style={styles.noResourcesText}>
            Can't load this step — you're offline and haven't opened it before.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  const videoId = step.video_url ? getYouTubeVideoId(step.video_url) : null;
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1` : null;
  // `resources` is only ever populated by getStep() — absent here means
  // this step is showing the plan's embedded fallback, not a real fetch.
  const resourcesLoaded = step.resources !== undefined;
  const resources = step.resources ?? [];
  const syncedLabel = formatRelativeTime(dataUpdatedAt);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.description}>{step.description}</Text>

      {!isOnline && (
        <View style={styles.offlineRow}>
          <Ionicons name="cloud-offline-outline" size={13} color={colors.textPlaceholder} />
          <Text style={styles.offlineText}>
            You're offline{syncedLabel ? ` — synced ${syncedLabel}` : ''}. Editing is disabled until you're back online.
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Aiming for</Text>
        <TouchableOpacity style={styles.dueDateRow} onPress={openDateEditor}>
          <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
          <Text style={styles.dueDateText}>{step.due_date ? `Aiming for ${step.due_date}` : 'Set a target date'}</Text>
          <Ionicons name="pencil" size={14} color={colors.textPlaceholder} style={styles.dueDateEditIcon} />
        </TouchableOpacity>

        {isEditingDate && (
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
              <YoutubeIframe
                videoId={videoId!}
                width={videoPlayerWidth}
                height={videoPlayerWidth * (9 / 16)}
                play
              />
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
        {!resourcesLoaded && !isOnline ? (
          <Text style={styles.noResourcesText}>Resources aren't available offline.</Text>
        ) : !resourcesLoaded && isFetching ? (
          <ActivityIndicator size="small" color={colors.textMuted} style={styles.resourcesLoading} />
        ) : resources.length === 0 ? (
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
                <Ionicons name="open-outline" size={16} color={colors.textPlaceholder} />
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

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 10 },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    description: { fontSize: 15, color: colors.textSecondary, marginTop: 10, lineHeight: 21 },
    offlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    offlineText: { flex: 1, fontSize: 12, color: colors.textPlaceholder },
    resourcesLoading: { alignSelf: 'flex-start', marginTop: 4 },
    section: { marginTop: 24 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 10 },
    dueDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: 'flex-start',
    },
    dueDateText: { fontSize: 14, color: colors.textSecondary, marginLeft: 8 },
    dueDateEditIcon: { marginLeft: 8 },
    datePickerRow: { marginTop: 8 },
    datePickerDoneButton: {
      alignSelf: 'flex-end',
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 20,
      borderRadius: 8,
      backgroundColor: colors.textPrimary,
    },
    datePickerDoneText: { color: colors.background, fontSize: 13, fontWeight: '600' },
    videoThumbnail: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    videoImage: { width: '100%', height: '100%', backgroundColor: colors.border },
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
    videoLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, paddingVertical: 8, paddingHorizontal: 10 },
    videoPlayer: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: '#000',
    },
    videoCloseButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      borderRadius: 13,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    noResourcesText: { fontSize: 14, color: colors.textPlaceholder, textAlign: 'center' },
    resourceCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10,
    },
    resourceCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    resourceTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1, marginRight: 8 },
    resourceSource: { fontSize: 12, color: colors.textPlaceholder, marginTop: 4 },
    resourceDescription: { fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 18 },
  });
