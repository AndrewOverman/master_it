import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSubscriptionTiers, refreshSubscription } from '../api/subscriptions';
import {
  getSubscriptionPackages,
  purchaseSubscription,
  restoreSubscription,
  PurchaseCancelledError,
  isPurchasesConfigured,
  type PurchasesPackage,
} from '../lib/purchases';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../lib/legal';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, Spinner, EmptyState } from '../components/ui';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

// Maps a RevenueCat package to our tier by looking for the tier id inside the
// product identifier (e.g. "masterit_pro_monthly" -> "pro"). The entitlement
// isn't on the package before purchase, so the product id is what's available
// to correlate against — which is why product identifiers must contain the
// tier name. Checked longest-first so "pro" can't match inside a hypothetical
// product that also contains "starter".
function tierIdForPackage(pkg: PurchasesPackage, tierIds: string[]): string | null {
  const identifier = pkg.product.identifier.toLowerCase();
  return (
    [...tierIds].sort((a, b) => b.length - a.length).find((id) => identifier.includes(id)) ?? null
  );
}

export function PaywallScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pendingPackage, setPendingPackage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const { data: tiers } = useQuery({ queryKey: ['subscriptionTiers'], queryFn: getSubscriptionTiers });

  const {
    data: packages,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['subscriptionPackages'],
    queryFn: getSubscriptionPackages,
    // Prices and availability come from the store; there's no value in a
    // cached copy outliving the screen.
    staleTime: 0,
    enabled: isPurchasesConfigured(),
  });

  // The server is the authority on what the user may now do, so the tier is
  // re-read from it rather than inferred from the purchase result.
  const syncAndClose = async () => {
    try {
      const user = await refreshSubscription();
      queryClient.setQueryData(['user'], user);
    } catch {
      // The webhook is the durable path — it will land regardless. Don't
      // block the user on our own reconciliation failing.
      queryClient.invalidateQueries({ queryKey: ['user'] });
    }
    navigation.goBack();
  };

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPendingPackage(pkg.identifier);
    try {
      await purchaseSubscription(pkg);
      await syncAndClose();
    } catch (error) {
      // Backing out of the store sheet is a normal outcome, not a failure.
      if (error instanceof PurchaseCancelledError) return;
      Alert.alert(
        'Purchase failed',
        'Your card was not charged. Please try again, or restore a previous purchase.'
      );
    } finally {
      setPendingPackage(null);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restoreSubscription();
      if (!restored) {
        Alert.alert('Nothing to restore', 'No previous purchase was found for this store account.');
        return;
      }
      await syncAndClose();
    } catch {
      Alert.alert('Could not restore', 'Please check your connection and try again.');
    } finally {
      setRestoring(false);
    }
  };

  const busy = pendingPackage !== null || restoring;
  const tierIds = tiers?.map((tier) => tier.id) ?? [];

  if (isLoading) {
    return <Spinner fullScreen />;
  }

  // One branch for both "RevenueCat isn't configured" and "the offering came
  // back empty" — from the user's side they're the same thing, and neither
  // should render a paywall with no way to pay.
  if (isError || !packages || packages.length === 0) {
    return (
      <EmptyState
        title="Plans aren't available right now"
        message="We couldn't load subscription options. Please try again in a moment."
        actionLabel="Try again"
        onAction={() => refetch()}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Keep building plans</Text>
      <Text style={styles.subheading}>
        Every plan is written for you by AI. Choose how many you want each month.
      </Text>

      {packages.map((pkg) => {
        const tierId = tierIdForPackage(pkg, tierIds);
        const tier = tiers?.find((candidate) => candidate.id === tierId);
        const isPending = pendingPackage === pkg.identifier;

        return (
          <View key={pkg.identifier} style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={styles.tierName}>{tier?.name ?? pkg.product.title}</Text>
              {/* The store's localized price, never a hardcoded one — this is
                  the only figure that's correct in every currency and region. */}
              <Text style={styles.tierPrice}>{pkg.product.priceString}</Text>
            </View>

            {tier ? (
              <View style={styles.benefitRow}>
                <Ionicons name="sparkles-outline" size={17} color={colors.accent} />
                <Text style={styles.benefitText}>
                  {tier.monthly_generations} AI-generated plans per month
                </Text>
              </View>
            ) : null}

            <View style={styles.benefitRow}>
              <Ionicons name="infinite-outline" size={17} color={colors.accent} />
              <Text style={styles.benefitText}>Unlimited copies of featured plans</Text>
            </View>

            <Button
              label={`Choose ${tier?.name ?? pkg.product.title}`}
              onPress={() => handlePurchase(pkg)}
              loading={isPending}
              disabled={busy && !isPending}
              style={styles.tierButton}
            />
          </View>
        );
      })}

      {/* Apple requires a restore path — without it, a subscriber who
          reinstalls looks like a free user and has no way back. */}
      <Button
        label="Restore Purchases"
        variant="secondary"
        onPress={handleRestore}
        loading={restoring}
        disabled={busy && !restoring}
        style={styles.restoreButton}
      />

      <Text style={styles.fineprint}>
        Subscriptions renew automatically until cancelled. Manage or cancel any time in your
        device's account settings.
      </Text>

      {/* Required at the point of purchase, not only at sign-up. */}
      <View style={styles.legalRow}>
        <TouchableOpacity
          onPress={() => Linking.openURL(TERMS_URL)}
          accessibilityRole="link"
          accessibilityLabel="Terms of Service"
        >
          <Text style={styles.legalLink}>Terms</Text>
        </TouchableOpacity>
        <Text style={styles.legalSeparator}>·</Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
        >
          <Text style={styles.legalLink}>Privacy</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, width: '100%', maxWidth: 520, alignSelf: 'center' },
    heading: { fontSize: typography.h1.fontSize, lineHeight: typography.h1.lineHeight, fontWeight: '700', color: colors.textPrimary },
    subheading: {
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      marginBottom: spacing.xl,
    },
    tierCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    tierHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    tierName: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary },
    tierPrice: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
    benefitText: {
      flex: 1,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
      color: colors.textSecondary,
    },
    tierButton: { marginTop: spacing.sm },
    restoreButton: { marginTop: spacing.xs },
    fineprint: {
      fontSize: typography.small.fontSize,
      lineHeight: typography.small.lineHeight,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
    legalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    legalLink: {
      fontSize: typography.small.fontSize,
      fontWeight: '600',
      color: colors.accent,
      paddingVertical: spacing.xs,
    },
    legalSeparator: { fontSize: typography.small.fontSize, color: colors.textMuted },
  });
