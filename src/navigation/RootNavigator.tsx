import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigation,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackHeaderProps,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import {
  handleNotificationAction,
  routeForNotification,
  type NotificationPayload,
} from '../lib/pushNotifications';
import { LoginScreen } from '../screens/LoginScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { NewPlanScreen } from '../screens/NewPlanScreen';
import { GeneratingScreen } from '../screens/GeneratingScreen';
import { PlanDetailScreen } from '../screens/PlanDetailScreen';
import { PlanFailedScreen } from '../screens/PlanFailedScreen';
import { PlanRejectedScreen } from '../screens/PlanRejectedScreen';
import { StepDetailScreen } from '../screens/StepDetailScreen';
import { PlansListScreen } from '../screens/PlansListScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { FeaturedPlansScreen } from '../screens/FeaturedPlansScreen';
import { SharedPlanScreen } from '../screens/SharedPlanScreen';
import { FeaturedPlanScreen } from '../screens/FeaturedPlanScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { useFeaturedOfflineSampleSync } from '../hooks/useFeaturedOfflineSample';
import type { ThemeColors } from '../theme/colors';
import type { PaywallSource } from '../lib/analytics';
import { Spinner } from '../components/ui';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

// One stack per tab, rather than a single stack shared by everything.
// Previously Account and Settings were pushed onto the same stack as the
// plan flow, so backing out of Account landed on Settings, and the stack
// only ever grew. Now each tab keeps its own history.
//
// Screens that operate on the user's *own* plans live in the Plans stack and
// only there. Explore-side actions that produce or open one of your plans
// (copying a featured plan, adding a shared one) jump to the Plans tab
// instead of getting duplicate copies of those screens — a plan you own
// belongs in one place.
export type PlansStackParamList = {
  Today: undefined;
  PlansList: undefined;
  NewPlan: undefined;
  Generating: { planId: number };
  PlanDetail: { planId: number };
  StepDetail: { planId: number; stepId: number };
  PlanFailed: { planId: number; message: string | null };
  PlanRejected: { planId: number };
};

export type ExploreStackParamList = {
  Featured: undefined;
  FeaturedPlan: { planId: number };
  SharedPlan: { token: string };
};

export type MeStackParamList = {
  Account: undefined;
  Settings: undefined;
};

export type MainTabParamList = {
  Today: undefined;
  Explore: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token: string; email: string };
  Main: undefined;
  // Root-level rather than inside a tab stack: the paywall is reachable from
  // the new-plan form, the refine flow and Settings, and duplicating it into
  // each stack (or bouncing the user to the Me tab mid-flow, losing a
  // half-filled form) are both worse. As a modal it dismisses back to
  // wherever it was opened from.
  Paywall: { source: PaywallSource } | undefined;
};

// Pulls the token out of a masterit://plans/shared/{token} deep link (and
// the equivalent https:// universal-link path, if that's added later).
// Regex over the raw string rather than the URL constructor — RN/Hermes
// support for URL parsing of custom schemes is inconsistent across
// versions, and this only ever needs one path shape.
function extractShareToken(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/plans\/shared\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Pulls token + email out of a masterit://reset-password?token=...&email=...
// link (see AppServiceProvider::boot()'s ResetPassword::createUrlUsing on
// the backend). Same manual-parse approach as extractShareToken, for the
// same reason — no URL constructor for custom schemes.
function extractResetParams(url: string | null): { token: string; email: string } | null {
  if (!url) return null;
  const match = url.match(/\/\/reset-password\?(.+)/);
  if (!match) return null;

  const params = Object.fromEntries(
    match[1].split('&').map((pair) => {
      const [key, value = ''] = pair.split('=');
      return [key, decodeURIComponent(value)];
    })
  );

  return params.token && params.email ? { token: params.token, email: params.email } : null;
}

/**
 * Turns a notification's payload into a navigation target.
 *
 * Every route here lives inside a tab, so each navigate() has to name the
 * tab as well as the screen — the same nesting the share-link effect uses.
 * Unknown or malformed payloads land on Today rather than doing nothing:
 * a tapped notification that appears to be ignored reads as a broken app.
 */
function navigateToNotification(
  navigationRef: ReturnType<typeof useNavigationContainerRef>,
  payload: NotificationPayload
): void {
  const navigate = navigationRef.navigate as any;

  if (payload.screen === 'Settings') {
    navigate('Main', { screen: 'Me', params: { screen: 'Settings' } });
    return;
  }

  if (payload.screen === 'StepDetail' && payload.planId && payload.stepId) {
    navigate('Main', {
      screen: 'Today',
      params: {
        screen: 'StepDetail',
        params: { planId: payload.planId, stepId: payload.stepId },
      },
    });
    return;
  }

  if (payload.screen === 'PlanDetail' && payload.planId) {
    navigate('Main', {
      screen: 'Today',
      params: { screen: 'PlanDetail', params: { planId: payload.planId } },
    });
    return;
  }

  if (payload.screen === 'NewPlan') {
    navigate('Main', { screen: 'Today', params: { screen: 'NewPlan' } });
    return;
  }

  navigate('Main', { screen: 'Today', params: { screen: 'Today' } });
}

const RootStack = createNativeStackNavigator<RootStackParamList>();
const PlansStack = createNativeStackNavigator<PlansStackParamList>();
const ExploreStack = createNativeStackNavigator<ExploreStackParamList>();
const MeStack = createNativeStackNavigator<MeStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function BackButton() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

// Native headers on iOS can't be resized via style props (they're a real
// UINavigationBar), so this replaces the header entirely to get a taller
// bar and bigger touch targets.
//
// The left slot is now driven by `back`: any pushed screen gets a back
// button automatically, and each tab's root screen gets nothing. That's what
// fixes New Plan, which used to show a hamburger — leaving someone who
// opened it by mistake with no visible way out. Screens can still override
// the slot via `options.headerLeft` (GeneratingScreen suppresses it while a
// plan is being built).
function AppHeader({ options, back }: NativeStackHeaderProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <View style={styles.headerContent}>
        <View style={styles.headerSlot}>
          {options.headerLeft
            ? options.headerLeft({ canGoBack: navigation.canGoBack() })
            : back
              ? <BackButton />
              : null}
        </View>
        {/* Two lines, not one: the slot is only as wide as the screen minus
            two 60pt gutters, so at large Dynamic Type sizes even the short
            static titles ran out of room. The bar has a minHeight rather than
            a fixed height, so a second line grows it instead of clipping. */}
        <Text style={styles.headerTitle} numberOfLines={2}>
          {options.title}
        </Text>
        <View style={[styles.headerSlot, styles.headerRightSlot]}>
          {options.headerRight ? options.headerRight({ canGoBack: navigation.canGoBack() }) : null}
        </View>
      </View>
    </View>
  );
}

// A modal is dismissed, not backed out of — a chevron-back in a sheet that
// slid up from the bottom points the wrong way. Only used by the paywall.
function CloseButton() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Close"
    >
      <Ionicons name="close" size={28} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

// The drawer used to be the only route to Settings. With it gone, the Me
// tab's root screen carries the entry point instead.
function SettingsButton() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Settings')}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Settings"
    >
      <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const stackScreenOptions = {
  headerShown: true,
  header: (props: NativeStackHeaderProps) => <AppHeader {...props} />,
};

function PlansStackNavigator() {
  return (
    <PlansStack.Navigator initialRouteName="Today" screenOptions={stackScreenOptions}>
      <PlansStack.Screen name="Today" component={TodayScreen} options={{ title: 'Today' }} />
      <PlansStack.Screen name="PlansList" component={PlansListScreen} options={{ title: 'All Plans' }} />
      <PlansStack.Screen name="NewPlan" component={NewPlanScreen} options={{ title: 'New Plan' }} />
      <PlansStack.Screen
        name="Generating"
        component={GeneratingScreen}
        options={{ title: 'Building your plan', headerBackVisible: false, headerLeft: () => null }}
      />
      <PlansStack.Screen name="PlanDetail" component={PlanDetailScreen} options={{ title: 'My Plan' }} />
      <PlansStack.Screen name="StepDetail" component={StepDetailScreen} options={{ title: 'Step' }} />
      <PlansStack.Screen name="PlanFailed" component={PlanFailedScreen} options={{ title: 'Plan Failed' }} />
      <PlansStack.Screen
        name="PlanRejected"
        component={PlanRejectedScreen}
        options={{ title: 'Plan Not Available' }}
      />
    </PlansStack.Navigator>
  );
}

function ExploreStackNavigator() {
  return (
    <ExploreStack.Navigator initialRouteName="Featured" screenOptions={stackScreenOptions}>
      <ExploreStack.Screen
        name="Featured"
        component={FeaturedPlansScreen}
        options={{ title: 'Featured Plans' }}
      />
      <ExploreStack.Screen
        name="FeaturedPlan"
        component={FeaturedPlanScreen}
        options={{ title: 'Plan Preview' }}
      />
      <ExploreStack.Screen name="SharedPlan" component={SharedPlanScreen} options={{ title: 'Shared Plan' }} />
    </ExploreStack.Navigator>
  );
}

function MeStackNavigator() {
  return (
    <MeStack.Navigator initialRouteName="Account" screenOptions={stackScreenOptions}>
      <MeStack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'Account', headerRight: () => <SettingsButton /> }}
      />
      <MeStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </MeStack.Navigator>
  );
}

const TAB_ICONS: Record<keyof MainTabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Today: { active: 'today', inactive: 'today-outline' },
  Explore: { active: 'compass', inactive: 'compass-outline' },
  Me: { active: 'person-circle', inactive: 'person-circle-outline' },
};

function MainNavigator() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  useFeaturedOfflineSampleSync();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={TAB_ICONS[route.name as keyof MainTabParamList][focused ? 'active' : 'inactive']}
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Today" component={PlansStackNavigator} />
      <Tab.Screen name="Explore" component={ExploreStackNavigator} />
      <Tab.Screen name="Me" component={MeStackNavigator} />
    </Tab.Navigator>
  );
}

// Conditionally rendering Login vs Main (rather than just picking an
// initialRouteName once) is what lets signOut() — called from screens
// deeply nested inside Main — swap the app back to Login just by
// flipping isAuthenticated, with no manual navigation reset needed.
function RootNavigatorContent() {
  const { isAuthenticated } = useAuth();
  const { colors, colorScheme } = useTheme();
  const navigationRef = useNavigationContainerRef();
  const queryClient = useQueryClient();
  const [pendingShareToken, setPendingShareToken] = useState<string | null>(null);
  const [pendingResetParams, setPendingResetParams] = useState<{ token: string; email: string } | null>(
    null
  );
  const [pendingNotification, setPendingNotification] = useState<NotificationPayload | null>(null);

  // Capture a share or reset-password link whether it opens the app cold
  // (getInitialURL) or the app is already running (the 'url' event) — either
  // way just record it; the effects below decide when it's safe to act on it.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      const shareToken = extractShareToken(url);
      if (shareToken) setPendingShareToken(shareToken);
      const resetParams = extractResetParams(url);
      if (resetParams) setPendingResetParams(resetParams);

      // Verification happens entirely on the web page the emailed link opens
      // (see the backend's EmailVerificationController) — by the time the app
      // is reopened through this link the work is already done, so there's
      // nowhere to navigate. Refetching the user is the whole job: it's what
      // clears VerifyEmailBanner and re-enables the New Plan button.
      if (url?.includes('//email-verified')) {
        queryClient.invalidateQueries({ queryKey: ['user'] });
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [queryClient]);

  // Jump straight to the shared plan once there's both a token to act on
  // and an authenticated navigator to act on it in — this is what makes a
  // link tapped from the Login screen resume into the right place after
  // sign-in, instead of just dropping the user on the home screen.
  useEffect(() => {
    if (!isAuthenticated || !pendingShareToken) return;
    const token = pendingShareToken;

    let cancelled = false;
    const tryNavigate = () => {
      if (cancelled) return;
      if (navigationRef.isReady()) {
        (navigationRef.navigate as any)('Main', {
          screen: 'Explore',
          params: { screen: 'SharedPlan', params: { token } },
        });
        setPendingShareToken(null);
      } else {
        setTimeout(tryNavigate, 100);
      }
    };
    tryNavigate();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, pendingShareToken, navigationRef]);

  // Notification taps. Same record-now/navigate-when-ready shape as the
  // deep-link effects, for the same reason: a cold start delivers the
  // response before the navigator exists.
  //
  // getLastNotificationResponseAsync() covers the app being launched *by*
  // the tap; the listener covers it already running. Action buttons
  // ("Mark done", "Snooze") are consumed by the handler and never navigate
  // — the whole point of them is not having to open the app.
  useEffect(() => {
    let cancelled = false;

    const consume = (response: Notifications.NotificationResponse | null) => {
      if (!response || cancelled) return;

      handleNotificationAction(response).then((handled) => {
        if (handled || cancelled) return;
        const route = routeForNotification(response);
        if (route) setPendingNotification(route);
      });
    };

    Notifications.getLastNotificationResponseAsync().then(consume);
    const subscription = Notifications.addNotificationResponseReceivedListener(consume);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !pendingNotification) return;
    const route = pendingNotification;

    let cancelled = false;
    const tryNavigate = () => {
      if (cancelled) return;
      if (navigationRef.isReady()) {
        navigateToNotification(navigationRef, route);
        setPendingNotification(null);
      } else {
        setTimeout(tryNavigate, 100);
      }
    };
    tryNavigate();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, pendingNotification, navigationRef]);

  // Mirror of the effect above for reset-password links, but gated on
  // isAuthenticated === false rather than true — whoever tapped this link is
  // by definition logged out (that's why they requested it), and
  // ResetPassword only exists on the unauthenticated stack.
  useEffect(() => {
    if (isAuthenticated !== false || !pendingResetParams) return;
    const params = pendingResetParams;

    let cancelled = false;
    const tryNavigate = () => {
      if (cancelled) return;
      if (navigationRef.isReady()) {
        (navigationRef.navigate as any)('ResetPassword', params);
        setPendingResetParams(null);
      } else {
        setTimeout(tryNavigate, 100);
      }
    };
    tryNavigate();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, pendingResetParams, navigationRef]);

  const navigationTheme = useMemo(() => {
    const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.surface,
        border: colors.border,
        text: colors.textPrimary,
        primary: colors.accent,
      },
    };
  }, [colors, colorScheme]);

  if (isAuthenticated === null) {
    return <Spinner fullScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <RootStack.Screen name="Main" component={MainNavigator} />
            <RootStack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{
                presentation: 'modal',
                headerShown: true,
                header: (props) => <AppHeader {...props} />,
                headerLeft: () => <CloseButton />,
                title: 'Upgrade',
              }}
            />
          </>
        ) : (
          <>
            <RootStack.Screen name="Login" component={LoginScreen} />
            <RootStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <RootStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

export function RootNavigator() {
  return (
    <AuthProvider>
      <RootNavigatorContent />
    </AuthProvider>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
    headerContent: {
      // minHeight, not height: the title scales with Dynamic Type, and a fixed
      // 68 clipped it at the larger accessibility sizes.
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
    },
    headerSlot: { width: 60, alignItems: 'flex-start', justifyContent: 'center' },
    headerRightSlot: { alignItems: 'flex-end' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary },
    tabBar: { backgroundColor: colors.surface, borderTopColor: colors.borderMuted },
    tabBarLabel: { fontSize: typography.small.fontSize, fontWeight: '600' },
  });
