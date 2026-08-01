import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Plan } from '../types/plan';

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
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.copyButton}
        onPress={onCopy}
        disabled={isCopying}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isCopying ? (
          <ActivityIndicator size="small" color="#111827" />
        ) : (
          <Ionicons name="add-circle" size={30} color="#111827" />
        )}
      </TouchableOpacity>

      <View style={styles.emojiWrap}>
        {plan.emoji ? (
          <Text style={styles.emoji}>{plan.emoji}</Text>
        ) : (
          <Ionicons name="image-outline" size={36} color="#9CA3AF" />
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#F3F4F6',
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
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emoji: { fontSize: 40 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center' },
  prompt: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },
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
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  badgeText: { fontSize: 12, color: '#374151', fontWeight: '500' },
});
