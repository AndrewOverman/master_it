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
import { getPlan, getStep, setStepDueDate } from '../api/plans';
import type { Plan, PlanStep } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline, useRequireOnline } from '../lib/offline';
import { formatRelativeTime } from '../utils/relativeTime';
import { formatDueDate } from '../utils/dueDate';
import { useToggleStep } from '../hooks/useToggleStep';
import { PlanCompleteOverlay } from '../components/PlanCompleteOverlay';
import { Button, EmptyState, OfflineNotice, Spinner } from '../components/ui';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

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

  // Shares the ['plan', planId] cache the detail screen already fills, so
  // this is usually free. Needed for "what comes after this one".
  const { data: plan } = useQuery({ queryKey: ['plan', planId], queryFn: () => getPlan(planId) });

  // The header used to carry the step's title, which is already the H1
  // immediately below it — so a long title got truncated twice on one screen
  // and the header's whole width went to repeating a word and a half. The
  // position is information the screen doesn't otherwise show.
  useEffect(() => {
    if (!plan) return;
    const ordered = [...plan.steps].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((s) => s.id === stepId);
    navigation.setOptions({
      title: index >= 0 ? `Step ${index + 1} of ${ordered.length}` : 'Step',
    });
  }, [plan, stepId, navigation]);

  const [celebratingPlanId, setCelebratingPlanId] = useState<number | null>(null);
  const { toggleStep } = useToggleStep(planId, setCelebratingPlanId);

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
        <EmptyState icon="cloud-offline-outline" message="Can't load this step — you're offline and haven't opened it before." />
      );
    }
    return <Spinner fullScreen />;
  }

  const videoId = step.video_url ? getYouTubeVideoId(step.video_url) : null;
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1` : null;
  // `resources` is only ever populated by getStep() — absent here means
  // this step is showing the plan's embedded fallback, not a real fetch.
  const resourcesLoaded = step.resources !== undefined;
  const resources = step.resources ?? [];
  const syncedLabel = formatRelativeTime(dataUpdatedAt);
  const due = step.due_date ? formatDueDate(step.due_date) : null;
  const showOverdue = Boolean(due?.isOverdue) && !step.completed_at;
  const isComplete = Boolean(step.completed_at);
  const orderedSteps = plan ? [...plan.steps].sort((a, b) => a.order - b.order) : [];
  const nextStep = orderedSteps[orderedSteps.findIndex((s) => s.id === stepId) + 1];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.description}>{step.description}</Text>

      {!isOnline && (
        <OfflineNotice syncedLabel={syncedLabel} style={styles.offlineNotice} />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Target date</Text>
        <TouchableOpacity
          style={styles.dueDateRow}
          onPress={openDateEditor}
          accessibilityRole="button"
          accessibilityLabel={due ? `Target date ${due.text}. Tap to change.` : 'Set a target date'}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={showOverdue ? colors.destructive : colors.textMuted}
          />
          <Text style={[styles.dueDateText, showOverdue && styles.dueDateTextOverdue]}>
            {due ? due.text : 'Set a target date'}
          </Text>
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
              <Button
                label="Done"
                onPress={() => pendingDate && commitDueDate(pendingDate)}
                style={styles.datePickerDoneButton}
              />
            )}
          </View>
        )}
      </View>

      {(thumbnailUrl || embedUrl) && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Video</Text>
          {thumbnailUrl && !isPlaying && (
            // The label sits outside the thumbnail, not inside it: the
            // thumbnail is a fixed 16:9 box with overflow hidden, and the
            // image already fills its full height, so a sibling text node in
            // there gets laid out past the bottom edge and clipped away.
            <TouchableOpacity
              onPress={() => setIsPlaying(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Play video: ${step.video_title ?? 'watch video'}`}
            >
              <View style={styles.videoThumbnail}>
                <Image source={{ uri: thumbnailUrl }} style={styles.videoImage} />
                <View style={styles.videoPlayOverlay}>
                  <Ionicons name="play-circle" size={40} color="#ffffff" />
                </View>
              </View>
              <Text style={styles.videoLabel} numberOfLines={2}>
                {step.video_title ?? 'Watch video'}
              </Text>
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
                accessibilityRole="button"
                accessibilityLabel="Close video"
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
              accessibilityRole="link"
              accessibilityLabel={`${resource.title}${
                resource.source ? `, from ${resource.source}` : ''
              }. Opens in your browser.`}
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

      {/* Completing a step used to mean backing out to the plan checklist —
          so the screen you read the step on couldn't record that you'd done
          it. */}
      <View style={styles.actions}>
        <Button
          label={isComplete ? 'Completed' : 'Mark as complete'}
          variant={isComplete ? 'secondary' : 'primary'}
          onPress={() => {
            if (!requireOnline('check off a step')) return;
            toggleStep({ stepId, completed: !isComplete });
          }}
        />
        {nextStep && (
          <TouchableOpacity
            style={styles.nextStepRow}
            // replace, not push: walking a plan step by step shouldn't build
            // a back stack the length of the plan.
            onPress={() => navigation.replace('StepDetail', { planId, stepId: nextStep.id })}
            accessibilityRole="button"
          >
            <Text style={styles.nextStepText} numberOfLines={1}>
              Next: {nextStep.title}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      <PlanCompleteOverlay
        visible={celebratingPlanId !== null}
        planId={celebratingPlanId}
        onDismiss={() => setCelebratingPlanId(null)}
      />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    title: { fontSize: typography.h2.fontSize, fontWeight: '700', color: colors.textPrimary },
    description: { fontSize: typography.bodyMedium.fontSize, color: colors.textSecondary, marginTop: 10, lineHeight: typography.bodyMedium.lineHeight },
    offlineNotice: { marginTop: 10, marginBottom: 0 },
    resourcesLoading: { alignSelf: 'flex-start', marginTop: spacing.xxs },
    section: { marginTop: spacing.xl },
    sectionLabel: { fontSize: typography.caption.fontSize, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 10 },
    dueDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: 'flex-start',
    },
    dueDateText: { fontSize: typography.label.fontSize, color: colors.textSecondary, marginLeft: spacing.xs },
    dueDateTextOverdue: { color: colors.destructive, fontWeight: '600' },
    dueDateEditIcon: { marginLeft: spacing.xs },
    datePickerRow: { marginTop: spacing.xs },
    datePickerDoneButton: {
      alignSelf: 'flex-end',
      marginTop: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
    },
    videoThumbnail: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: radius.md,
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
    videoLabel: {
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
      lineHeight: typography.caption.lineHeight,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    videoPlayer: {
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: '#000',
    },
    videoCloseButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      borderRadius: radius.md,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    noResourcesText: { fontSize: typography.label.fontSize, color: colors.textPlaceholder, textAlign: 'center' },
    resourceCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 10,
    },
    resourceCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    resourceTitle: { fontSize: typography.bodyMedium.fontSize, fontWeight: '600', color: colors.textPrimary, flex: 1, marginRight: spacing.xs },
    resourceSource: { fontSize: typography.small.fontSize, color: colors.textPlaceholder, marginTop: spacing.xxs },
    resourceDescription: { fontSize: typography.caption.fontSize, color: colors.textMuted, marginTop: 6, lineHeight: typography.caption.lineHeight },
    actions: { marginTop: spacing.xxl },
    nextStepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
    },
    nextStepText: { flexShrink: 1, fontSize: typography.label.fontSize, fontWeight: '600', color: colors.accent },
  });
