import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { submitPlanFeedback } from '../api/plans';
import {
  FEEDBACK_TAG_LABELS,
  NEGATIVE_FEEDBACK_TAGS,
  POSITIVE_FEEDBACK_TAGS,
  type FeedbackTag,
} from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { shadows } from '../theme/shadows';
import { Button } from './ui';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONFETTI_COLORS = ['#FDE68A', '#FCA5A5', '#93C5FD', '#6EE7B7', '#C4B5FD', '#FDBA74', '#F472B6'];
const CONFETTI_COUNT = 40;
// Longer than the plain-congratulations version this replaced — there's now
// a rating and chips to actually read and act on, not just a message.
const AUTO_DISMISS_MS = 30000;
// Stars read as a rating regardless of theme — deliberately not colors.accent,
// which is themed (and dark mode's accent is blue, which wouldn't read as a
// star rating the same way).
const STAR_COLOR = '#F5B400';
const RATING_VALUES = [1, 2, 3, 4, 5];

interface ConfettiPieceConfig {
  left: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  rotationDirection: number;
}

function ConfettiPiece({ config }: { config: ConfettiPieceConfig }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: config.duration,
      delay: config.delay,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, SCREEN_HEIGHT + 40],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, config.rotationDirection * 24, 0],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${config.rotationDirection * 360}deg`],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        staticStyles.confettiPiece,
        {
          left: config.left,
          width: config.size,
          height: config.size * 0.4,
          backgroundColor: config.color,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    />
  );
}

interface PlanCompleteOverlayProps {
  visible: boolean;
  // Which plan just got celebrated — feedback submits against this. Null is
  // valid (and just skips the feedback submission) so callers don't need to
  // juggle two separate pieces of state to drive this component.
  planId: number | null;
  onDismiss: () => void;
  message?: string;
}

export function PlanCompleteOverlay({ visible, planId, onDismiss, message }: PlanCompleteOverlayProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<FeedbackTag[]>([]);
  // Starts true so the very first frame can't fire 40 falling pieces at
  // someone who asked the OS for less motion — the check is async, and
  // defaulting to false would flash the animation before it resolved.
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    // The setting can be toggled while the app is running.
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const feedbackMutation = useMutation({
    mutationFn: (payload: { rating?: number; tags?: FeedbackTag[] }) => submitPlanFeedback(planId!, payload),
    // Best-effort signal, not a user-facing action — there's nothing useful
    // to do with a failure here, and popping an error alert over what's
    // supposed to be a celebration would be worse than just dropping it.
  });

  const cancelAutoDismiss = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  // Engaging with the rating/chips cancels the auto-dismiss timer — a user
  // mid-feedback shouldn't have the modal vanish under them.
  const handleRate = (value: number) => {
    cancelAutoDismiss();
    setRating(value);
  };

  const toggleTag = (tag: FeedbackTag) => {
    cancelAutoDismiss();
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  };

  const handleDismiss = () => {
    cancelAutoDismiss();

    if (planId && (rating !== null || selectedTags.length > 0)) {
      feedbackMutation.mutate({
        ...(rating !== null ? { rating } : {}),
        ...(selectedTags.length > 0 ? { tags: selectedTags } : {}),
      });
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setRating(null);
      setSelectedTags([]);
      onDismiss();
    });
  };

  useEffect(() => {
    if (!visible) return;

    // Reduce Motion covers the fade too, not just the confetti — snap it in
    // rather than crossfading.
    if (reduceMotion) {
      fadeAnim.setValue(1);
    } else {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }

    dismissTimer.current = setTimeout(handleDismiss, AUTO_DISMISS_MS);

    return () => {
      cancelAutoDismiss();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion]);

  const confettiPieces = useMemo<ConfettiPieceConfig[]>(() => {
    // No pieces at all under Reduce Motion — the 🎉 glyph and the card carry
    // the celebration instead, which is the point of the setting.
    if (!visible || reduceMotion) return [];
    return Array.from({ length: CONFETTI_COUNT }, () => ({
      left: Math.random() * SCREEN_WIDTH,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 16 + Math.random() * 16,
      delay: Math.random() * 400,
      duration: 2600 + Math.random() * 1400,
      rotationDirection: Math.random() > 0.5 ? 1 : -1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion]);

  if (!visible) return null;

  const renderChip = (tag: FeedbackTag, sentiment: 'positive' | 'negative') => {
    const selected = selectedTags.includes(tag);
    const selectedStyle = sentiment === 'positive' ? styles.chipSelectedPositive : styles.chipSelectedNegative;

    return (
      <TouchableOpacity
        key={tag}
        style={[styles.chip, selected && selectedStyle]}
        onPress={() => toggleTag(tag)}
        accessibilityRole="checkbox"
        accessibilityLabel={FEEDBACK_TAG_LABELS[tag]}
        accessibilityState={{ checked: selected }}
      >
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{FEEDBACK_TAG_LABELS[tag]}</Text>
      </TouchableOpacity>
    );
  };

  return (
    // A real Modal, not just an absolutely-positioned View: as a plain View
    // this rendered inside the screen body, so the app header stayed visible
    // above a backdrop that was meant to cover everything, and Android's
    // hardware back had nothing to close. animationType is "none" because the
    // fade is driven by fadeAnim below.
    <Modal visible transparent animationType="none" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        {confettiPieces.map((config, index) => (
          <ConfettiPiece key={index} config={config} />
        ))}

        {/* Rendered before the card so card taps never reach it — the scrim is
            the third way out, alongside Done and the auto-dismiss timer. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        {/* Claims its own touches so a tap on the card's background doesn't
            fall through to the scrim. Android walks to the next sibling
            underneath when a child declines a touch; iOS doesn't, and without
            this the card would be dismissible on one platform only. Inner
            touchables still win — the responder system asks deepest-first. */}
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Congratulations!</Text>
          <Text style={styles.message}>
            {message ??
              "Keep up the momentum and setup a new plan to accomplish your goals! You can do whatever you set your mind to with Master It!"}
          </Text>

          <Text style={styles.feedbackPrompt}>How did this plan go?</Text>
          {/* The row announces the rating as a whole, so it's clear what's
              currently chosen without stepping through all five stars — the
              filled/hollow glyph was the only signal before. */}
          <View
            style={styles.starRow}
            accessibilityLabel={
              rating === null ? 'Rating: not rated yet' : `Rating: ${rating} out of 5 stars`
            }
          >
            {RATING_VALUES.map((value) => {
              const filled = rating !== null && value <= rating;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => handleRate(value)}
                  // 30pt glyph + 7pt each side clears 44×44; the old 6pt
                  // horizontal slop left the stars 2pt narrow.
                  hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
                  accessibilityRole="radio"
                  accessibilityLabel={`Rate ${value} out of 5 stars`}
                  accessibilityState={{ selected: rating === value }}
                >
                  <Ionicons name={filled ? 'star' : 'star-outline'} size={30} color={STAR_COLOR} />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.chipSectionLabel}>What worked</Text>
          <View style={styles.chipRow}>{POSITIVE_FEEDBACK_TAGS.map((tag) => renderChip(tag, 'positive'))}</View>

          <Text style={styles.chipSectionLabel}>What could be better</Text>
          <View style={styles.chipRow}>{NEGATIVE_FEEDBACK_TAGS.map((tag) => renderChip(tag, 'negative'))}</View>

          <Button label="Done" onPress={handleDismiss} style={styles.doneButton} />
        </View>
      </Animated.View>
    </Modal>
  );
}

const staticStyles = StyleSheet.create({
  confettiPiece: {
    position: 'absolute',
    top: 0,
    borderRadius: 2,
  },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    card: {
      width: '84%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      paddingVertical: 28,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      ...shadows.card,
    },
    emoji: { fontSize: 40, marginBottom: spacing.xs },
    title: { fontSize: typography.h2.fontSize, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
    message: { fontSize: typography.bodyMedium.fontSize, color: colors.textSecondary, textAlign: 'center', lineHeight: typography.bodyMedium.lineHeight },
    feedbackPrompt: {
      fontSize: typography.label.fontSize,
      fontWeight: '600',
      color: colors.textPrimary,
      marginTop: spacing.lg,
      marginBottom: 10,
    },
    starRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: 18 },
    chipSectionLabel: {
      alignSelf: 'flex-start',
      fontSize: typography.small.fontSize,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 6,
    },
    chipRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.xs,
      marginBottom: 14,
    },
    chip: {
      // 44pt floor, same as the option chips on New Plan and Refine.
      minHeight: 44,
      justifyContent: 'center',
      paddingVertical: 7,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    chipSelectedPositive: { backgroundColor: colors.success, borderColor: colors.success },
    chipSelectedNegative: { backgroundColor: colors.destructive, borderColor: colors.destructive },
    chipText: { fontSize: typography.small.fontSize, color: colors.textSecondary },
    chipTextSelected: { color: colors.background, fontWeight: '600' },
    doneButton: { alignSelf: 'stretch', marginTop: 6, paddingHorizontal: spacing.xxl },
  });
