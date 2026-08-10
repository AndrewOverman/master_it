import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { useTheme, type ThemePreference } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

// Read from the running binary (Info.plist / AndroidManifest) rather than from
// the Expo config, because an OTA update ships a new JS bundle onto an old
// native build — config-derived values would then name a version the user
// isn't actually running, which is the one thing a support footer must not do.
//
// Both are null on web and in contexts without a native binary, so the build
// number is only appended when there is one to append.
const VERSION_LABEL = (() => {
  const version = Application.nativeApplicationVersion;
  const build = Application.nativeBuildVersion;
  if (!version) return null;
  return build ? `Version ${version} (${build})` : `Version ${version}`;
})();

// Deep links to the OS subscription manager. Apple requires a route to
// cancellation from inside the app; neither store lets us cancel on the
// user's behalf, so pointing at the right settings screen is the whole job.
const MANAGE_SUBSCRIPTION_URL = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
  default: undefined,
});

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
};

const THEME_OPTIONS: { label: string; value: ThemePreference; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Light', value: 'light', icon: 'sunny-outline' },
  { label: 'Dark', value: 'dark', icon: 'moon-outline' },
  { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
];

export function SettingsScreen() {
  const { signOut, clearSession } = useAuth();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [deleteVisible, setDeleteVisible] = useState(false);

  // Shares the ['user'] cache with Account and New Plan.
  const { data: user } = useQuery({ queryKey: ['user'], queryFn: getCurrentUser });
  const tier = user?.subscription_tier ?? 'free';
  const isPaid = tier !== 'free';
  const remaining = user?.generations_remaining;
  const limit = user?.generations_limit;

  const handleLogOut = () => {
    Alert.alert('Log out?', "You'll need to sign back in to access your plans.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  // The account is already gone server-side here, so drop the local session
  // without a logout call, and clear the caches — the deleted user's plans are
  // in a persisted query cache that would otherwise still be sitting there for
  // whoever signs in next on this device.
  const handleDeleted = async () => {
    setDeleteVisible(false);
    queryClient.clear();
    await clearSession();
  };

  // "Renews" vs "Ends" is the difference between a live subscription and one
  // that's been cancelled but still has time on it — telling someone their
  // cancelled plan "renews" next month is actively wrong.
  //
  // "Expired" is read off the date rather than subscription_status: a lapse
  // reaches us as whatever event RevenueCat last sent (or as nothing at all,
  // if that webhook was missed), so the date is the only thing that reliably
  // says the subscription is over. Without this, a past date renders as
  // "Renews on <date that has already passed>".
  const expiredAlready = user?.subscription_expires_at
    ? new Date(user.subscription_expires_at).getTime() <= Date.now()
    : false;
  const expiryLabel = expiredAlready
    ? 'Expired'
    : user?.subscription_status === 'canceled'
      ? 'Ends'
      : 'Renews';
  const expiresAt = user?.subscription_expires_at
    ? new Date(user.subscription_expires_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Subscription</Text>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.tierName}>{TIER_LABELS[tier] ?? tier}</Text>
          {isPaid ? (
            <View style={styles.tierBadge}>
              <Text style={styles.tierBadgeText}>Active</Text>
            </View>
          ) : null}
        </View>

        {typeof remaining === 'number' && typeof limit === 'number' ? (
          <Text style={styles.cardDetail}>
            {remaining} of {limit} plan generation{limit === 1 ? '' : 's'} left this month
          </Text>
        ) : null}

        {expiresAt ? (
          <Text style={styles.cardDetail}>
            {expiryLabel} on {expiresAt}
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.cardAction}
          onPress={() => navigation.navigate('Paywall', { source: 'settings' })}
          accessibilityRole="button"
          accessibilityLabel={isPaid ? 'Change plan' : 'See subscription plans'}
        >
          <Text style={styles.cardActionText}>{isPaid ? 'Change plan' : 'See plans'}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.accent} />
        </TouchableOpacity>

        {/* Only shown to subscribers: sending a free user to an empty
            subscription list in Settings is a dead end that looks broken. */}
        {isPaid && MANAGE_SUBSCRIPTION_URL ? (
          <TouchableOpacity
            style={styles.cardAction}
            onPress={() => Linking.openURL(MANAGE_SUBSCRIPTION_URL)}
            accessibilityRole="link"
            accessibilityLabel="Manage subscription"
          >
            <Text style={styles.cardActionText}>Manage subscription</Text>
            <Ionicons name="open-outline" size={15} color={colors.accent} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>Appearance</Text>
      <View style={styles.themeRow} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
        {THEME_OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.themeOption, selected && styles.themeOptionSelected]}
              onPress={() => setPreference(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
            >
              <Ionicons
                name={option.icon}
                size={20}
                color={selected ? colors.background : colors.textSecondary}
              />
              <Text style={[styles.themeOptionText, selected && styles.themeOptionTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={styles.row}
        onPress={handleLogOut}
        accessibilityRole="button"
        accessibilityLabel="Log out"
      >
        <Ionicons name="log-out-outline" size={22} color={colors.destructive} />
        <Text style={styles.rowLabel}>Log Out</Text>
      </TouchableOpacity>

      {/* Its own labelled section, so the only two destructive-looking rows on
          the screen can't be mistaken for one another. Account deletion has to
          be reachable in-app under App Store Guideline 5.1.1(v). */}
      <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger zone</Text>
      <TouchableOpacity
        style={[styles.row, styles.dangerRow]}
        onPress={() => setDeleteVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
      >
        <Ionicons name="trash-outline" size={22} color={colors.destructive} />
        <View style={styles.rowText}>
          <Text style={styles.dangerLabel}>Delete Account</Text>
          <Text style={styles.rowHint}>Permanently deletes your account and all your plans.</Text>
        </View>
      </TouchableOpacity>

      {/* Pinned to the bottom via marginTop: 'auto' rather than by ordering,
          so it stays put as sections are added above it. `selectable` because
          the point of the footer is being able to quote it in a support
          message. */}
      {VERSION_LABEL ? (
        <Text style={styles.version} selectable accessibilityLabel={VERSION_LABEL}>
          {VERSION_LABEL}
        </Text>
      ) : null}

      <DeleteAccountModal
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        onDeleted={handleDeleted}
      />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // flexGrow so the version footer's `marginTop: 'auto'` still reaches the
    // bottom of the viewport when the content is shorter than the screen.
    content: { flexGrow: 1, padding: spacing.lg },
    sectionTitle: { fontSize: typography.caption.fontSize, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 10 },
    laterSectionTitle: { marginTop: spacing.xl },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tierName: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary },
    tierBadge: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceMuted,
    },
    // textSecondary, not `accent` on `accentMuted` — that pairing is 3.9:1
    // and fails AA (see the note in colors.ts).
    tierBadgeText: { fontSize: typography.small.fontSize, fontWeight: '700', color: colors.textSecondary },
    cardDetail: {
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      color: colors.textSecondary,
      marginTop: spacing.xxs,
    },
    cardAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minHeight: 44,
    },
    cardActionText: { fontSize: typography.label.fontSize, fontWeight: '600', color: colors.accent },
    themeRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
    themeOption: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 6,
    },
    themeOptionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    themeOptionText: { fontSize: typography.caption.fontSize, fontWeight: '600', color: colors.textSecondary },
    themeOptionTextSelected: { color: colors.background },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderMuted,
    },
    rowLabel: { fontSize: typography.body.fontSize, fontWeight: '600', color: colors.destructive, marginLeft: spacing.sm },
    dangerTitle: { marginTop: spacing.xxl },
    dangerRow: { alignItems: 'flex-start', borderColor: colors.destructive },
    rowText: { flex: 1, marginLeft: spacing.sm },
    dangerLabel: { fontSize: typography.body.fontSize, fontWeight: '600', color: colors.destructive },
    rowHint: {
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      color: colors.textMuted,
      marginTop: 2,
    },
    version: {
      marginTop: 'auto',
      paddingTop: spacing.xl,
      textAlign: 'center',
      fontSize: typography.small.fontSize,
      lineHeight: typography.small.lineHeight,
      color: colors.textMuted,
    },
  });
