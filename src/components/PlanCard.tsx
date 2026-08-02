import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

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
  onCopy,
  isCopying,
}: {
  plan: Plan;
  onCopy: () => void;
  isCopying: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.copyButton}
        onPress={onCopy}
        disabled={isCopying}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isCopying ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : (
          <Ionicons name="add-circle" size={30} color={colors.textPrimary} />
        )}
      </TouchableOpacity>

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
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      alignItems: 'center',
    },
    copyButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      zIndex: 1,
    },
    emojiWrap: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emoji: { fontSize: 40 },
    title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    prompt: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'center',
      marginTop: 14,
    },
    badge: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    badgeText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  });
