import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listFeaturedPlans, copyPlan } from '../api/plans';
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

export function FeaturedPlansScreen({ navigation }: any) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['plans', 'featured'],
    queryFn: ({ pageParam }) => listFeaturedPlans(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.current_page < lastPage.meta.last_page
        ? lastPage.meta.current_page + 1
        : undefined,
  });

  const copyMutation = useMutation({
    mutationFn: copyPlan,
    onSuccess: (newPlan) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      navigation.navigate('PlanDetail', { planId: newPlan.id });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ?? 'Could not add this plan. Please try again.';
      Alert.alert('Something went wrong', message);
    },
  });

  const handleCopyPress = (plan: Plan) => {
    Alert.alert(
      'Add to your plans?',
      `This adds "${plan.title}" to your plans so you can track it with checkboxes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add', onPress: () => copyMutation.mutate(plan.id) },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  const plans = data?.pages.flatMap((page) => page.data) ?? [];

  if (plans.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No featured plans yet. Check back soon!</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Plan }) => {
    const isCopyingThis = copyMutation.isPending && copyMutation.variables === item.id;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.copyButton}
          onPress={() => handleCopyPress(item)}
          disabled={copyMutation.isPending}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isCopyingThis ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <Ionicons name="add-circle" size={30} color="#111827" />
          )}
        </TouchableOpacity>

        <View style={styles.emojiWrap}>
          {item.emoji ? (
            <Text style={styles.emoji}>{item.emoji}</Text>
          ) : (
            <Ionicons name="image-outline" size={36} color="#9CA3AF" />
          )}
        </View>

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.prompt} numberOfLines={3}>
          {item.original_prompt}
        </Text>

        <View style={styles.badgeRow}>
          {item.skill_level && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{SKILL_LABELS[item.skill_level]}</Text>
            </View>
          )}
          {item.time_commitment && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{TIME_LABELS[item.time_commitment]}</Text>
            </View>
          )}
          {item.target_days && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.target_days} days</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={plans}
      keyExtractor={(plan) => String(plan.id)}
      contentContainerStyle={styles.list}
      renderItem={renderItem}
      refreshing={isRefetching}
      onRefresh={refetch}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      ListFooterComponent={
        isFetchingNextPage ? (
          <ActivityIndicator size="small" color="#111827" style={styles.footerSpinner} />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#6B7280', textAlign: 'center' },
  list: { padding: 20, flexGrow: 1 },
  footerSpinner: { marginVertical: 20 },
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
