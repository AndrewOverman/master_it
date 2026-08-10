import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { listPlans } from '../api/plans';
import { getCurrentUser, type AuthUser } from '../api/auth';
import { useToggleStep } from '../hooks/useToggleStep';
import { useRequireOnline } from '../lib/offline';
import { CreatePlanFab } from '../components/CreatePlanFab';
import { PlanCompleteOverlay } from '../components/PlanCompleteOverlay';
import { VerifyEmailBanner } from '../components/VerifyEmailBanner';
import { formatDueDate } from '../utils/dueDate';
import { setBadgeCount } from '../lib/pushNotifications';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Avatar, Button, ProgressBar, Spinner } from '../components/ui';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Styles = ReturnType<typeof createStyles>;

// A plan belongs on Today only while there's something left to do in it:
// finished generating, not manually marked complete, and at least one step
// still unchecked.
function isActive(plan: Plan): boolean {
  return (
    plan.status === 'ready' && !plan.completed_at && plan.steps.some((step) => !step.completed_at)
  );
}

function nextStepOf(plan: Plan) {
  return [...plan.steps].sort((a, b) => a.order - b.order).find((step) => !step.completed_at);
}

// Local midnight, matching formatDueDate()'s whole-day comparisons — a
// step due today must not start counting as overdue at 00:00 UTC.
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function dueOnOrBefore(isoDate: string, cutoff: number): boolean {
  // Parsed as local, not `new Date('2026-08-14')`, which is treated as UTC
  // and lands on the previous day west of Greenwich.
  const due = new Date(`${isoDate}T00:00:00`).getTime();
  return !Number.isNaN(due) && due <= cutoff;
}

/**
 * The app's home.
 *
 * Every other screen answered "what plans do I have?". None of them answered
 * "what do I do now?" — which is the question a tracking app exists to
 * answer. This shows one card per active plan, each surfacing that plan's
 * next unchecked step, checkable in place.
 *
 * Reads the same ['plans'] query the list screen uses, so it needs no new
 * endpoint and shares its cache.
 */
export function TodayScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: plans, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  });

  const { data: user } = useQuery({ queryKey: ['user'], queryFn: getCurrentUser });

  // Held here, not inside the cards: finishing a plan makes it inactive, so
  // its card unmounts in the same render that completes it. State owned by
  // the card would vanish before the overlay could appear.
  const [celebratingPlanId, setCelebratingPlanId] = useState<number | null>(null);

  const openNewPlan = () => navigation.navigate('NewPlan');
  const activePlans = (plans ?? []).filter(isActive);
  const hasNoPlans = (plans?.length ?? 0) === 0;

  // The badge counts what this screen exists to answer — steps due today or
  // already past due. Kept in sync from here rather than from the
  // notification itself, because the count changes whenever a step is
  // checked off, which happens far more often than a notification arrives.
  useEffect(() => {
    if (!plans) return;

    const today = startOfToday();
    const outstanding = plans
      .filter(isActive)
      .flatMap((plan) => plan.steps)
      .filter((step) => !step.completed_at && step.due_date && dueOnOrBefore(step.due_date, today));

    setBadgeCount(outstanding.length);
  }, [plans]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Spinner fullScreen />
        <CreatePlanFab label="Create Plan" onPress={openNewPlan} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={activePlans}
        keyExtractor={(plan) => String(plan.id)}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={refetch}
        renderItem={({ item }) => (
          <NextStepCard
            plan={item}
            styles={styles}
            colors={colors}
            navigation={navigation}
            onPlanComplete={setCelebratingPlanId}
          />
        )}
        ListHeaderComponent={
          <>
            <GreetingHeader user={user} styles={styles} />
            {/* Above the plan list rather than below the greeting's fold:
                until this is dealt with, creating a plan — the only thing
                this screen invites you to do — will be refused. */}
            <VerifyEmailBanner />
            {hasNoPlans ? <FirstPlanHero colors={colors} styles={styles} onCreate={openNewPlan} /> : null}
            {activePlans.length > 0 ? <Text style={styles.sectionHeading}>Up next</Text> : null}
          </>
        }
        ListEmptyComponent={hasNoPlans ? null : <AllCaughtUp colors={colors} styles={styles} />}
        ListFooterComponent={
          hasNoPlans ? null : (
            <TouchableOpacity
              style={styles.seeAllRow}
              onPress={() => navigation.navigate('PlansList')}
              accessibilityRole="button"
            >
              <Text style={styles.seeAllText}>
                See all plans ({plans?.length ?? 0})
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
          )
        }
      />
      <CreatePlanFab label="Create Plan" onPress={openNewPlan} />
      <PlanCompleteOverlay
        visible={celebratingPlanId !== null}
        planId={celebratingPlanId}
        onDismiss={() => setCelebratingPlanId(null)}
      />
    </View>
  );
}

// One card per active plan. A component rather than inline JSX in renderItem
// because it needs its own toggle hook, and hooks can't be called per
// iteration inside a map. Completion is reported upward — see the note on
// celebratingPlanId above for why the card can't hold that itself.
function NextStepCard({
  plan,
  styles,
  colors,
  navigation,
  onPlanComplete,
}: {
  plan: Plan;
  styles: Styles;
  colors: ThemeColors;
  navigation: any;
  onPlanComplete: (planId: number) => void;
}) {
  const requireOnline = useRequireOnline();
  const { toggleStep } = useToggleStep(plan.id, onPlanComplete);

  const step = nextStepOf(plan);
  const completedCount = plan.steps.filter((s) => s.completed_at).length;
  const due = step?.due_date ? formatDueDate(step.due_date) : null;

  if (!step) return null;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}
        accessibilityRole="button"
        accessibilityLabel={`Open plan ${plan.title}`}
      >
        <Text style={styles.cardEmoji}>{plan.emoji ?? '📘'}</Text>
        <Text style={styles.cardPlanTitle} numberOfLines={1}>
          {plan.title}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textPlaceholder} />
      </TouchableOpacity>

      <View style={styles.stepRow}>
        <TouchableOpacity
          onPress={() => {
            if (!requireOnline('check off a step')) return;
            toggleStep({ stepId: step.id, completed: true });
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="checkbox"
          accessibilityLabel={step.title}
          accessibilityState={{ checked: false }}
        >
          <View style={styles.checkbox} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.stepText}
          onPress={() => navigation.navigate('StepDetail', { planId: plan.id, stepId: step.id })}
          accessibilityRole="button"
          accessibilityLabel={`Open step: ${step.title}`}
        >
          <Text style={styles.stepTitle}>{step.title}</Text>
          {due && (
            <Text style={[styles.stepDue, due.isOverdue && styles.stepDueOverdue]}>
              {due.isOverdue ? `Due ${due.text}` : `Aiming for ${due.text}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ProgressBar
        ratio={completedCount / plan.steps.length}
        style={styles.cardProgress}
        label={`Progress on ${plan.title}`}
        valueText={`${completedCount} of ${plan.steps.length} steps complete`}
      />
      <Text style={styles.cardProgressLabel}>
        {completedCount} of {plan.steps.length} steps complete
      </Text>
    </View>
  );
}

// Renders nothing until the user query resolves, rather than a skeleton —
// this is a personalization touch layered on top, not content the screen
// depends on to be useful.
function GreetingHeader({ user, styles }: { user: AuthUser | undefined; styles: Styles }) {
  if (!user) return null;

  const firstName = user.name.trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.greetingRow}>
      <Avatar name={user.name} size={40} />
      <Text style={styles.greetingText}>
        {greeting}, {firstName}
      </Text>
    </View>
  );
}

// Every plan is either finished or manually completed. Deliberately warm
// rather than an "empty" state — nothing is missing here, the user is done.
function AllCaughtUp({ colors, styles }: { colors: ThemeColors; styles: Styles }) {
  return (
    <View style={styles.caughtUp}>
      <Ionicons name="checkmark-done-circle-outline" size={40} color={colors.success} />
      <Text style={styles.caughtUpTitle}>You're all caught up</Text>
      <Text style={styles.caughtUpMessage}>
        Nothing left to check off. Start a new plan whenever you're ready.
      </Text>
    </View>
  );
}

// First-run landing: leads straight into the core "describe a goal, get a
// plan" action rather than an empty list.
function FirstPlanHero({
  colors,
  styles,
  onCreate,
}: {
  colors: ThemeColors;
  styles: Styles;
  onCreate: () => void;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroIcon}>
        <Ionicons name="sparkles" size={26} color={colors.accent} />
      </View>
      <Text style={styles.heroTitle}>Let's build your first plan</Text>
      <Text style={styles.heroSubtitle}>
        Describe any skill or goal — we'll turn it into a step-by-step plan built just for you.
      </Text>
      <Button label="Build my first plan" onPress={onCreate} style={styles.heroButton} />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    list: { padding: spacing.lg, paddingBottom: 96, flexGrow: 1, backgroundColor: colors.background },
    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    greetingText: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary },
    sectionHeading: {
      fontSize: typography.caption.fontSize,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: spacing.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardEmoji: { fontSize: 18 },
    cardPlanTitle: { flex: 1, fontSize: typography.caption.fontSize, fontWeight: '600', color: colors.textMuted },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.sm },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.border,
      marginRight: spacing.sm,
    },
    stepText: { flex: 1 },
    stepTitle: { fontSize: typography.body.fontSize, fontWeight: '600', lineHeight: typography.body.lineHeight, color: colors.textPrimary },
    stepDue: { fontSize: typography.small.fontSize, color: colors.textPlaceholder, marginTop: 3 },
    stepDueOverdue: { color: colors.destructive, fontWeight: '600' },
    cardProgress: { marginTop: spacing.md },
    cardProgressLabel: { fontSize: typography.small.fontSize, color: colors.textPlaceholder, marginTop: 6 },
    seeAllRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xxs,
      paddingVertical: spacing.md,
    },
    seeAllText: { fontSize: typography.label.fontSize, fontWeight: '600', color: colors.accent },
    caughtUp: { alignItems: 'center', paddingVertical: spacing.xl },
    caughtUpTitle: {
      fontSize: typography.h3.fontSize,
      fontWeight: '700',
      color: colors.textPrimary,
      marginTop: spacing.sm,
    },
    caughtUpMessage: {
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xxs,
    },
    hero: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.lg,
      padding: spacing.xl,
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: radius.pill,
      backgroundColor: colors.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    heroTitle: {
      fontSize: typography.h2.fontSize,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    heroSubtitle: {
      fontSize: typography.bodyMedium.fontSize,
      lineHeight: typography.bodyMedium.lineHeight,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    heroButton: { alignSelf: 'stretch' },
  });
