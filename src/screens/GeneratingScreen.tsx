import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getPlan } from '../api/plans';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

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

// Polls GET /api/v1/plans/{id} until the queued generation job finishes,
// then routes to the appropriate next screen.
export function GeneratingScreen({ route, navigation }: any) {
  const { planId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: plan } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId),
    refetchInterval: (query) => (query.state.data?.status === 'generating' ? 2000 : false),
  });

  const [stageIndex, setStageIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(1)).current;

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

      <Text style={styles.title}>{isComplete ? 'Your plan is ready!' : 'Building your plan…'}</Text>

      <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
        {isComplete ? 'Opening it now…' : STAGES[stageIndex]}
      </Animated.Text>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fillWidth }]} />
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
    iconWrap: { height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
    track: {
      width: '100%',
      maxWidth: 220,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.borderMuted,
      marginTop: 24,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
  });
