import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listFeaturedPlans } from '../api/plans';
import { useCopyPlan } from '../hooks/useCopyPlan';
import { PlanCard } from '../components/PlanCard';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

export function FeaturedPlansScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

  const { copyMutation, handleCopyPress } = useCopyPlan(navigation);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
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

  const renderItem = ({ item }: { item: Plan }) => (
    <PlanCard
      plan={item}
      onCopy={() => handleCopyPress(item)}
      isCopying={copyMutation.isPending && copyMutation.variables === item.id}
    />
  );

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
          <ActivityIndicator size="small" color={colors.textPrimary} style={styles.footerSpinner} />
        ) : null
      }
    />
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
    emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
    list: { padding: 20, flexGrow: 1, backgroundColor: colors.background },
    footerSpinner: { marginVertical: 20 },
  });
