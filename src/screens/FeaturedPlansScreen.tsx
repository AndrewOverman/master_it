import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { listFeaturedPlans, listPlans } from '../api/plans';
import { useCopyPlan } from '../hooks/useCopyPlan';
import { PlanCard } from '../components/PlanCard';
import { PlanLimitModal } from '../components/PlanLimitModal';
import type { Plan } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useIsOnline } from '../lib/offline';
import { FEATURED_OFFLINE_SAMPLE_KEY } from '../lib/queryPersistence';
import { Button, EmptyState, Spinner } from '../components/ui';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

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

  // Zero plans of their own (created or copied) means this is effectively
  // a first-time landing — drives the hero CTA below instead of dropping
  // straight into the curated feed. Shares the ['plans'] cache with
  // PlansListScreen, so it clears the moment NewPlanScreen's create
  // mutation invalidates it.
  const { data: myPlans, isLoading: isMyPlansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
    enabled: isOnline,
  });
  const isFirstTime = !isMyPlansLoading && (myPlans?.length ?? 0) === 0;

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

  if (isLoading || isMyPlansLoading) {
    return <Spinner fullScreen />;
  }

  const plans = data?.pages.flatMap((page) => page.data) ?? [];

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
        ListHeaderComponent={
          isFirstTime ? (
            <FirstPlanHero
              colors={colors}
              styles={styles}
              onCreate={() => navigation.navigate('NewPlan')}
            />
          ) : null
        }
        ListEmptyComponent={<EmptyState message="No featured plans yet. Check back soon!" fullScreen={false} />}
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

// First-run landing: leads straight into the core "describe a goal, get a
// plan" action instead of the curated feed, per the Duolingo/Headspace
// pattern of getting to the first real action fast rather than a tutorial
// screen. The feed is still one scroll away, just no longer first.
function FirstPlanHero({
  colors,
  styles,
  onCreate,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onCreate: () => void;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroIcon}>
        <Ionicons name="sparkles" size={26} color={colors.accent} />
      </View>
      <Text style={styles.heroTitle}>Let's build your first plan</Text>
      <Text style={styles.heroSubtitle}>
        Describe any skill or goal — we'll turn it into a step-by-step plan built just for you.
      </Text>
      <Button label="Build my first plan" onPress={onCreate} style={styles.heroButton} />
      <Text style={styles.heroDivider}>Or get inspired by what others are building</Text>
    </View>
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
    hero: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.lg,
      padding: spacing.xl,
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: radius.pill,
      backgroundColor: colors.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    heroTitle: { fontSize: typography.h2.fontSize, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    heroSubtitle: {
      fontSize: 15,
      lineHeight: 21,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    heroButton: { alignSelf: 'stretch' },
    heroDivider: {
      fontSize: typography.caption.fontSize,
      fontWeight: '500',
      color: colors.textPlaceholder,
      marginTop: spacing.lg,
    },
  });
