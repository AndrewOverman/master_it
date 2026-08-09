import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

const SKILL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Some experience',
  advanced: 'Advanced',
};

const TIME_LABELS: Record<string, string> = {
  light: '~15 min/day',
  moderate: '~1 hr/day',
  intensive: 'Several hrs/day',
};

export function PlanCard({
  plan,
  onPress,
}: {
  plan: Plan;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The whole card opens a preview, and that's the only thing it does. It
  // used to carry a bare "+" that copied the plan on one unlabelled tap —
  // first as the card's *only* affordance, then alongside the preview once
  // that existed. Either way it asked for a commitment without ever showing
  // what was being committed to, so the preview (which has a labelled "Add to
  // My Plans") is now the single path in.
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Preview plan: ${plan.title}`}
    >
      <View style={styles.emojiWrap}>
        {plan.emoji ? (
          <Text style={styles.emoji}>{plan.emoji}</Text>
        ) : (
          <Ionicons name="image-outline" size={36} color={colors.textPlaceholder} />
        )}
      </View>

      <Text style={styles.title}>{plan.title}</Text>
      <Text style={styles.prompt} numberOfLines={3}>
        {plan.original_prompt}
      </Text>

      <View style={styles.badgeRow}>
        {plan.skill_level && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{SKILL_LABELS[plan.skill_level]}</Text>
          </View>
        )}
        {plan.time_commitment && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{TIME_LABELS[plan.time_commitment]}</Text>
          </View>
        )}
        {plan.target_days && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{plan.target_days} days</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      alignItems: 'center',
    },
    emojiWrap: {
      width: 72,
      height: 72,
      borderRadius: radius.xl,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emoji: { fontSize: 40 },
    title: { fontSize: typography.body.fontSize, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    prompt: { fontSize: typography.label.fontSize, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, lineHeight: typography.label.lineHeight },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      justifyContent: 'center',
      marginTop: 14,
    },
    badge: {
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    badgeText: { fontSize: typography.small.fontSize, color: colors.textSecondary, fontWeight: '500' },
  });
