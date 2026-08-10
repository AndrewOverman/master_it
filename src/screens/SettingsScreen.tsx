import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  AppState,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCurrentUser,
  updateProfile,
  type AuthUser,
  type NotificationCategory,
  type NotificationPreferences,
} from '../api/auth';
import { getPermissionStatus, registerForPushNotifications } from '../lib/pushNotifications';
import { useAuth } from '../context/AuthContext';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { SettingsSwitch } from '../components/ui';
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

      <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>Notifications</Text>
      <NotificationSettings styles={styles} colors={colors} />

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

// Iterated rather than written out four times, so adding a category on the
// backend is a one-line change here. Order is deliberate: the transactional
// one first, since it's the one people most want left on.
const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string; hint: string }[] = [
  {
    key: 'plan_updates',
    label: 'Plan updates',
    hint: 'When a plan finishes generating, or something goes wrong.',
  },
  {
    key: 'reminders',
    label: 'Reminders',
    hint: "A daily nudge about steps you're aiming to finish.",
  },
  {
    key: 'progress',
    label: 'Progress',
    hint: 'Milestones, streaks, and your weekly recap.',
  },
  {
    key: 'account',
    label: 'Account',
    hint: 'Subscription, billing, and generation allowance.',
  },
];

function formatHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}

/**
 * The notification preferences block.
 *
 * Two things are shown that a plain list of switches would get wrong: the
 * real OS permission state (a switch that's "on" while the system is
 * blocking every notification is a lie), and the reminder time, which only
 * matters while reminders are actually on.
 */
function NotificationSettings({ styles, colors }: { styles: Styles; colors: ThemeColors }) {
  const queryClient = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['user'], queryFn: getCurrentUser });
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [isEditingTime, setIsEditingTime] = useState(false);

  // Re-checked whenever the app comes back to the foreground, because the
  // most likely reason someone left was to change this exact setting in the
  // OS — coming back to a stale "notifications are off" banner would be
  // the app contradicting what they just did.
  useEffect(() => {
    let cancelled = false;

    const check = () => {
      getPermissionStatus().then((status) => {
        if (!cancelled) setPermission(status);
      });
    };

    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const mutation = useMutation({
    mutationFn: updateProfile,
    // Optimistic, because a switch that waits for a round trip before
    // moving feels broken — and this one is toggled far from any spinner.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['user'] });
      const previous = queryClient.getQueryData<AuthUser>(['user']);

      if (previous) {
        const preferences = { ...(previous.notification_preferences ?? EMPTY_PREFERENCES) };

        for (const category of NOTIFICATION_CATEGORIES) {
          const value = payload[`notify_${category.key}` as keyof typeof payload];
          if (typeof value === 'boolean') preferences[category.key] = value;
        }

        queryClient.setQueryData<AuthUser>(['user'], {
          ...previous,
          notification_preferences: preferences,
          daily_nudge_hour: payload.daily_nudge_hour ?? previous.daily_nudge_hour,
        });
      }

      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) queryClient.setQueryData(['user'], context.previous);
    },
    onSuccess: (updated) => queryClient.setQueryData(['user'], updated),
  });

  const preferences = user?.notification_preferences ?? EMPTY_PREFERENCES;
  const nudgeHour = user?.daily_nudge_hour ?? 9;

  const commitHour = (date: Date) => {
    setIsEditingTime(false);
    mutation.mutate({ daily_nudge_hour: date.getHours() });
  };

  return (
    <View style={styles.card}>
      {permission === 'denied' ? (
        <TouchableOpacity
          style={styles.permissionNotice}
          onPress={() => Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel="Open system settings to allow notifications"
        >
          <Ionicons name="notifications-off-outline" size={18} color={colors.destructive} />
          <Text style={styles.permissionNoticeText}>
            Notifications are turned off for Master It. Tap to allow them in Settings.
          </Text>
        </TouchableOpacity>
      ) : null}

      {permission === 'undetermined' ? (
        <TouchableOpacity
          style={styles.permissionNotice}
          onPress={() => registerForPushNotifications().then(() => getPermissionStatus().then(setPermission))}
          accessibilityRole="button"
          accessibilityLabel="Turn on notifications"
        >
          <Ionicons name="notifications-outline" size={18} color={colors.accent} />
          <Text style={styles.permissionNoticeText}>
            Turn on notifications to get reminders about your steps.
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Simulators and Expo Go can't receive push at all. Saying so beats
          leaving someone toggling switches that will never do anything. */}
      {permission === 'unsupported' ? (
        <View style={styles.permissionNotice}>
          <Ionicons name="phone-portrait-outline" size={18} color={colors.textMuted} />
          <Text style={styles.permissionNoticeText}>
            Notifications aren't available on this device.
          </Text>
        </View>
      ) : null}

      {NOTIFICATION_CATEGORIES.map((category, index) => (
        <View key={category.key}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <SettingsSwitch
            label={category.label}
            hint={category.hint}
            value={preferences[category.key]}
            disabled={!user}
            onValueChange={(value) =>
              mutation.mutate({ [`notify_${category.key}`]: value })
            }
          />
          {/* Nested under Reminders rather than given its own section: it
              configures that switch and is meaningless while it's off. */}
          {category.key === 'reminders' && preferences.reminders ? (
            <TouchableOpacity
              style={styles.cardAction}
              onPress={() => setIsEditingTime((editing) => !editing)}
              accessibilityRole="button"
              accessibilityLabel={`Reminder time, currently ${formatHour(nudgeHour)}`}
            >
              <Text style={styles.cardActionText}>Remind me at {formatHour(nudgeHour)}</Text>
              <Ionicons name="time-outline" size={15} color={colors.accent} />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {isEditingTime ? (
        <View style={styles.timePickerRow}>
          <DateTimePicker
            value={new Date(2026, 0, 1, nudgeHour, 0)}
            mode="time"
            // Whatever minute is picked is discarded — the backend schedules
            // on the hour, since it evaluates users hourly. The picker is
            // left at its default granularity because forcing 60-minute
            // steps reads as broken on Android, where the control shows a
            // minute field regardless.
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event: any, selected?: Date) => {
              // Android's picker is a one-shot dialog that reports its own
              // dismissal; iOS is an inline spinner that keeps emitting as
              // it scrolls. Same split as StepDetailScreen's date picker.
              if (Platform.OS === 'android') {
                setIsEditingTime(false);
                if (event.type === 'set' && selected) commitHour(selected);
              } else if (selected) {
                commitHour(selected);
              }
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const EMPTY_PREFERENCES: NotificationPreferences = {
  plan_updates: true,
  reminders: true,
  progress: true,
  account: true,
};

type Styles = ReturnType<typeof createStyles>;

type PermissionState = Awaited<ReturnType<typeof getPermissionStatus>>;

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
    divider: { height: 1, backgroundColor: colors.borderMuted, marginVertical: spacing.xxs },
    permissionNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingBottom: spacing.sm,
      marginBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderMuted,
    },
    permissionNoticeText: {
      flex: 1,
      fontSize: typography.small.fontSize,
      lineHeight: typography.small.lineHeight,
      color: colors.textMuted,
    },
    timePickerRow: { alignItems: 'center', marginTop: spacing.xs },
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
