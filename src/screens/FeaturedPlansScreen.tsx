import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { listFeaturedPlans } from '../api/plans';
import { useCopyPlan } from '../hooks/useCopyPlan';
import { PlanCard } from '../components/PlanCard';
import { PlanLimitModal } from '../components/PlanLimitModal';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline } from '../lib/offline';
import { FEATURED_OFFLINE_SAMPLE_KEY } from '../lib/queryPersistence';
import { EmptyState, Spinner } from '../components/ui';

export function FeaturedPlansScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = useIsOnline();

  // Just reads whatever useFeaturedOfflineSampleSync has already put in
  // the cache — enabled: false means this never triggers its own fetch.
  const { data: offlineSample = [] } = useQuery<Plan[]>({
    queryKey: FEATURED_OFFLINE_SAMPLE_KEY,
    queryFn: () => [],
    enabled: false,
  });

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
    enabled: isOnline,
  });

  const { copyMutation, handleCopyPress, limitModalVisible, limitModalMessage, dismissLimitModal } =
    useCopyPlan(navigation);

  const renderItem = ({ item }: { item: Plan }) => (
    <PlanCard
      plan={item}
      onCopy={() => handleCopyPress(item)}
      isCopying={copyMutation.isPending && copyMutation.variables === item.id}
    />
  );

  // Offline: skip the paginated feed entirely and show the bounded
  // sample kept around for exactly this — no infinite scroll without a
  // connection to back it.
  if (!isOnline) {
    return (
      <View style={styles.container}>
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
          <Text style={styles.offlineBannerText}>
            You're offline — showing {offlineSample.length} saved featured plan
            {offlineSample.length === 1 ? '' : 's'}.
          </Text>
        </View>
        {offlineSample.length === 0 ? (
          <EmptyState message="No featured plans saved for offline browsing yet. Open this screen once while online to save some." />
        ) : (
          <FlatList
            data={offlineSample}
            keyExtractor={(plan) => String(plan.id)}
            contentContainerStyle={styles.list}
            renderItem={renderItem}
          />
        )}
        <PlanLimitModal visible={limitModalVisible} message={limitModalMessage} onDismiss={dismissLimitModal} />
      </View>
    );
  }

  if (isLoading) {
    return <Spinner fullScreen />;
  }

  const plans = data?.pages.flatMap((page) => page.data) ?? [];

  if (plans.length === 0) {
    return <EmptyState message="No featured plans yet. Check back soon!" />;
  }

  return (
    <>
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
            <View style={styles.footerSpinner}>
              <Spinner size="small" />
            </View>
          ) : null
        }
      />
      <PlanLimitModal visible={limitModalVisible} message={limitModalMessage} onDismiss={dismissLimitModal} />
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    list: { padding: 20, flexGrow: 1, backgroundColor: colors.background },
    footerSpinner: { marginVertical: 20 },
    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 20,
      backgroundColor: colors.surfaceMuted,
    },
    offlineBannerText: { flex: 1, fontSize: 12.5, color: colors.textMuted },
  });
