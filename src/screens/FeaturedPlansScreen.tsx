import { useMemo } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { listFeaturedPlans } from '../api/plans';
import { CreatePlanFab } from '../components/CreatePlanFab';
import { PlanCard } from '../components/PlanCard';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline } from '../lib/offline';
import { FEATURED_OFFLINE_SAMPLE_KEY } from '../lib/queryPersistence';
import { EmptyState, OfflineNotice, Spinner } from '../components/ui';
import { spacing } from '../theme/spacing';

export function FeaturedPlansScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = useIsOnline();
  // Creating a plan is a Today-tab action — the form and the progress screen
  // both live in that stack, as will the finished plan.
  const openNewPlan = () => navigation.navigate('Today', { screen: 'NewPlan' });
  const newPlanFab = <CreatePlanFab label="Create Plan" onPress={openNewPlan} />;

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

  // No copy action here any more — a card opens the preview, and the preview
  // owns adding (and the limit modal that can come out of it).
  const renderItem = ({ item }: { item: Plan }) => (
    <PlanCard plan={item} onPress={() => navigation.navigate('FeaturedPlan', { planId: item.id })} />
  );

  // Offline: skip the paginated feed entirely and show the bounded
  // sample kept around for exactly this — no infinite scroll without a
  // connection to back it.
  if (!isOnline) {
    return (
      <View style={styles.container}>
        <OfflineNotice
          fullWidth
          message={`Showing ${offlineSample.length} saved featured plan${
            offlineSample.length === 1 ? '' : 's'
          }.`}
        />
        {offlineSample.length === 0 ? (
          <EmptyState message="No featured plans saved for offline browsing yet. Open this screen once while online to save some." />
        ) : (
          <FlatList
            data={offlineSample}
            keyExtractor={(plan) => String(plan.id)}
            contentContainerStyle={styles.listWithFab}
            renderItem={renderItem}
          />
        )}
        {newPlanFab}
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Spinner fullScreen />
        {newPlanFab}
      </View>
    );
  }

  const plans = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <>
      <FlatList
        data={plans}
        keyExtractor={(plan) => String(plan.id)}
        contentContainerStyle={styles.listWithFab}
        renderItem={renderItem}
        refreshing={isRefetching}
        onRefresh={refetch}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        ListEmptyComponent={<EmptyState message="No featured plans yet. Check back soon!" fullScreen={false} />}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerSpinner}>
              <Spinner size="small" />
            </View>
          ) : null
        }
      />
      {newPlanFab}
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // paddingBottom clears the floating FAB. No safe-area inset added — the
    // tab bar already accounts for it, and doubling up left dead space.
    listWithFab: { padding: spacing.lg, paddingBottom: 96, flexGrow: 1, backgroundColor: colors.background },
    footerSpinner: { marginVertical: spacing.lg },
  });
