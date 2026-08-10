import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getPlan } from '../api/plans';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button } from '../components/ui';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { track } from '../lib/analytics';
import { primePushPermission } from '../lib/pushNotifications';

// Generation has no real backend progress signal (GeneratePlanSteps flips
// status once, start to finish), so these stages are a timed simulation
// rather than driven by actual job phases. Tuned to the job's typical
// duration; if it runs long the last stage just holds until status flips.
const STAGES = [
  'Reading your goal…',
  'Structuring your plan…',
  'Finding helpful resources…',
  'Almost there…',
] as const;

const STAGE_INTERVAL_MS = 3200;
const PROGRESS_DURATION_MS = STAGE_INTERVAL_MS * STAGES.length;
const COMPLETE_HOLD_MS = 450;

// Roughly 3x the staged run above, i.e. well past "normal but slow". Past
// this point the wait stops being a progress bar and starts being a trap —
// a dead queue worker looks exactly like a slow one from here — so the copy
// levels with the user and an explicit way out appears. Deliberately not a
// hard failure: the job may well still land, and the plan is already saved
// either way, so leaving costs nothing.
const SLOW_AFTER_MS = 45000;

// Polls GET /api/v1/plans/{id} until the queued generation job finishes,
// then routes to the appropriate next screen.
export function GeneratingScreen({ route, navigation }: any) {
  const { planId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: plan } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId),
    // Keep polling until a terminal status actually comes back. Testing for
    // `=== 'generating'` instead would stop polling forever the moment a
    // fetch errored (data stays undefined, so the check fails and returns
    // false) — the screen would then sit at "Almost there…" for good even
    // after the connection recovered.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== 'generating' ? false : 2000;
    },
  });

  const [stageIndex, setStageIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timers = STAGES.slice(1).map((_, i) =>
      setTimeout(
        () => {
          setStageIndex(i + 1);
          Animated.sequence([
            Animated.timing(subtitleOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(subtitleOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start();
        },
        STAGE_INTERVAL_MS * (i + 1)
      )
    );

    Animated.timing(progress, {
      toValue: 0.92,
      duration: PROGRESS_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wall-clock from arriving on this screen to the plan resolving. This is the
  // number SLOW_AFTER_MS was guessed at without — once there's a real p95 in
  // the data, the "taking longer than usual" threshold can be set from it.
  const startedAt = useRef(Date.now());
  // Navigation away happens inside an animation callback, so this effect can
  // run again after it has already fired. Without the latch, a re-render
  // before the screen unmounts double-counts the outcome.
  const outcomeTracked = useRef(false);

  useEffect(() => {
    if (!plan || outcomeTracked.current) return;

    if (plan.status === 'ready') {
      outcomeTracked.current = true;
      track({
        name: 'plan_generation_completed',
        properties: {
          step_count: plan.steps?.length ?? 0,
          waited_ms: Date.now() - startedAt.current,
        },
      });

      // The permission prompt is spent the first time it's shown, so it's
      // asked here rather than at launch: the user has just watched a plan
      // of dated steps appear, which is the only moment "we'll remind you
      // about these" explains itself. No-ops if already decided.
      primePushPermission();
    } else if (plan.status === 'failed') {
      outcomeTracked.current = true;
      track({ name: 'plan_generation_failed' });
    } else if (plan.status === 'rejected') {
      outcomeTracked.current = true;
      track({ name: 'plan_generation_rejected' });
    }
  }, [plan]);

  useEffect(() => {
    if (!plan) return;
    if (plan.status === 'ready') {
      setIsComplete(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start(() => {
        setTimeout(() => navigation.replace('PlanDetail', { planId }), COMPLETE_HOLD_MS);
      });
    } else if (plan.status === 'failed') {
      navigation.replace('PlanFailed', { planId, message: plan.error_message });
    } else if (plan.status === 'rejected') {
      navigation.replace('PlanRejected', { planId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, navigation, planId]);

  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        {isComplete ? (
          <Ionicons name="checkmark-circle" size={48} color={colors.success} />
        ) : (
          <ActivityIndicator size="large" color={colors.accent} />
        )}
      </View>

      <Text style={styles.title}>
        {isComplete ? 'Your plan is ready!' : isSlow ? 'Still working on it' : 'Building your plan…'}
      </Text>

      <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
        {isComplete
          ? 'Opening it now…'
          : isSlow
            ? 'This one is taking longer than usual.'
            : STAGES[stageIndex]}
      </Animated.Text>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fillWidth }]} />
      </View>

      {isSlow && !isComplete && (
        <View style={styles.slowBlock}>
          <Text style={styles.slowNote}>
            You don't have to wait here — your plan keeps building on its own. It'll be in My Plans
            when it's done.
          </Text>
          <Button
            label="Go to My Plans"
            variant="secondary"
            onPress={() => navigation.replace('PlansList')}
            style={styles.slowButton}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
    iconWrap: { height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
    title: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: typography.label.fontSize, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
    track: {
      width: '100%',
      maxWidth: 220,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.borderMuted,
      marginTop: spacing.xl,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    slowBlock: { marginTop: 28, width: '100%', maxWidth: 320, alignItems: 'center' },
    slowNote: {
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    slowButton: { alignSelf: 'stretch' },
  });
