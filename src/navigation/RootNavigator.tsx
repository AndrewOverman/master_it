import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  DrawerActions,
  useNavigation,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackHeaderProps,
} from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { LoginScreen } from '../screens/LoginScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { NewPlanScreen } from '../screens/NewPlanScreen';
import { GeneratingScreen } from '../screens/GeneratingScreen';
import { PlanDetailScreen } from '../screens/PlanDetailScreen';
import { StepDetailScreen } from '../screens/StepDetailScreen';
import { PlansListScreen } from '../screens/PlansListScreen';
import { FeaturedPlansScreen } from '../screens/FeaturedPlansScreen';
import { SharedPlanScreen } from '../screens/SharedPlanScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { useFeaturedOfflineSampleSync } from '../hooks/useFeaturedOfflineSample';
import type { ThemeColors } from '../theme/colors';
import { Spinner } from '../components/ui';

export type AppStackParamList = {
  Featured: undefined;
  NewPlan: undefined;
  Generating: { planId: number };
  PlanDetail: { planId: number };
  StepDetail: { planId: number; stepId: number };
  PlanFailed: { planId: number; message: string | null };
  PlanRejected: { planId: number };
  PlansList: { celebrate?: boolean } | undefined;
  SharedPlan: { token: string };
  Settings: undefined;
  Account: undefined;
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

export type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token: string; email: string };
  Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Drawer = createDrawerNavigator();

// Minimal fallback screen if generation fails server-side
function PlanFailedScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.failedContainer}>
      <Text style={styles.failedTitle}>Couldn't build your plan</Text>
      <Text style={styles.failedMessage}>
        {route.params?.message ?? 'Something went wrong generating this plan. Please try again.'}
      </Text>
      <Text style={styles.retryLink} onPress={() => navigation.navigate('NewPlan')}>
        Try again
      </Text>
    </View>
  );
}

// Shown when the backend declines to generate a plan for the submitted
// goal (Plan.status === 'rejected'). Deliberately separate from
// PlanFailedScreen: "failed" implies a bug worth retrying as-is, this
// implies a boundary — the copy stays neutral and non-accusatory, never
// echoes the user's prompt or the model's internal category/reason back
// at them, and always leaves a way forward.
function PlanRejectedScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.failedContainer}>
      <Text style={styles.failedTitle}>We can't build a plan for that</Text>
      <Text style={styles.failedMessage}>
        This request falls outside what Master It can help with. Try rephrasing your goal.
      </Text>
      <Text style={styles.retryLink} onPress={() => navigation.navigate('NewPlan')}>
        Start a new plan
      </Text>
    </View>
  );
}

function BackButton() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

// Native headers on iOS can't be resized via style props (they're a real
// UINavigationBar), so this replaces the header entirely to get a taller
// bar and a bigger hamburger icon. Screens can still override the left
// slot the normal way via `options.headerLeft` (e.g. GeneratingScreen
// hides it during generation).
function AppHeader({ options }: NativeStackHeaderProps) {
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
          {options.headerLeft ? (
            options.headerLeft({ canGoBack: navigation.canGoBack() })
          ) : (
            <TouchableOpacity
              onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="menu-outline" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {options.title}
        </Text>
        <View style={[styles.headerSlot, styles.headerRightSlot]}>
          {options.headerRight ? options.headerRight({ canGoBack: navigation.canGoBack() }) : null}
        </View>
      </View>
    </View>
  );
}

function AppStackNavigator() {
  return (
    <AppStack.Navigator
      initialRouteName="Featured"
      screenOptions={{ headerShown: true, header: (props) => <AppHeader {...props} /> }}
    >
      <AppStack.Screen name="Featured" component={FeaturedPlansScreen} options={{ title: 'Featured Plans' }} />
      <AppStack.Screen name="NewPlan" component={NewPlanScreen} options={{ title: 'New Plan' }} />
      <AppStack.Screen
        name="Generating"
        component={GeneratingScreen}
        options={{ title: 'Building your plan', headerBackVisible: false, headerLeft: () => null }}
      />
      <AppStack.Screen
        name="PlanDetail"
        component={PlanDetailScreen}
        options={{ title: 'My Plan', headerLeft: () => <BackButton /> }}
      />
      <AppStack.Screen
        name="StepDetail"
        component={StepDetailScreen}
        options={{ title: 'Step', headerLeft: () => <BackButton /> }}
      />
      <AppStack.Screen name="PlanFailed" component={PlanFailedScreen} options={{ title: 'Plan Failed' }} />
      <AppStack.Screen name="PlanRejected" component={PlanRejectedScreen} options={{ title: 'Plan Not Available' }} />
      <AppStack.Screen name="PlansList" component={PlansListScreen} options={{ title: 'My Plans' }} />
      <AppStack.Screen
        name="SharedPlan"
        component={SharedPlanScreen}
        options={{ title: 'Shared Plan', headerLeft: () => <BackButton /> }}
      />

      <AppStack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
      <AppStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      
    </AppStack.Navigator>
  );
}

function DrawerContent(props: DrawerContentComponentProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.drawerContainer}>
      <SafeAreaView edges={['top']} style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Master It</Text>
        <Text style={styles.drawerSubtitle}>Build. Track. Finish.</Text>
      </SafeAreaView>

      <View style={styles.drawerDivider} />

      <DrawerContentScrollView
        {...props}
        style={styles.drawerScroll}
        contentContainerStyle={styles.drawerContent}
      >
        <DrawerItem
          label="Featured"
          labelStyle={styles.drawerItemLabel}
          icon={({ size, color }) => <Ionicons name="sparkles-outline" size={size} color={color} />}
          activeTintColor={colors.textPrimary}
          inactiveTintColor={colors.textSecondary}
          activeBackgroundColor={colors.surfaceMuted}
          pressColor={colors.surfaceMuted}
          style={styles.drawerItem}
          onPress={() => {
            props.navigation.navigate('App', { screen: 'Featured' });
            props.navigation.dispatch(DrawerActions.closeDrawer());
          }}
        />
        <DrawerItem
          label="Plans"
          labelStyle={styles.drawerItemLabel}
          icon={({ size, color }) => <Ionicons name="list-outline" size={size} color={color} />}
          activeTintColor={colors.textPrimary}
          inactiveTintColor={colors.textSecondary}
          activeBackgroundColor={colors.surfaceMuted}
          pressColor={colors.surfaceMuted}
          style={styles.drawerItem}
          onPress={() => {
            props.navigation.navigate('App', { screen: 'PlansList' });
            props.navigation.dispatch(DrawerActions.closeDrawer());
          }}
        />
      </DrawerContentScrollView>

      <SafeAreaView edges={['bottom']} style={styles.drawerFooter}>
        <View style={styles.drawerDivider} />
        <View style={styles.drawerFooterContent}>
          <DrawerItem
            label="Account"
            labelStyle={styles.drawerItemLabel}
            icon={({ size, color }) => <Ionicons name="person-circle-outline" size={size} color={color} />}
            activeTintColor={colors.textPrimary}
            inactiveTintColor={colors.textSecondary}
            activeBackgroundColor={colors.surfaceMuted}
            pressColor={colors.surfaceMuted}
            style={styles.drawerItem}
            onPress={() => {
              props.navigation.navigate('App', { screen: 'Account' });
              props.navigation.dispatch(DrawerActions.closeDrawer());
            }}
          />
          <DrawerItem
            label="Settings"
            labelStyle={styles.drawerItemLabel}
            icon={({ size, color }) => <Ionicons name="settings-outline" size={size} color={color} />}
            activeTintColor={colors.textPrimary}
            inactiveTintColor={colors.textSecondary}
            activeBackgroundColor={colors.surfaceMuted}
            pressColor={colors.surfaceMuted}
            style={styles.drawerItem}
            onPress={() => {
              props.navigation.navigate('App', { screen: 'Settings' });
              props.navigation.dispatch(DrawerActions.closeDrawer());
            }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function MainNavigator() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  useFeaturedOfflineSampleSync();
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: styles.drawer,
        overlayColor: colors.overlay,
      }}
    >
      <Drawer.Screen name="App" component={AppStackNavigator} />
    </Drawer.Navigator>
  );
}

// Conditionally rendering Login vs Main (rather than just picking an
// initialRouteName once) is what lets signOut() — called from screens
// deeply nested inside Main — swap the app back to Login just by
// flipping isAuthenticated, with no manual navigation reset needed.
function RootNavigatorContent() {
  const { isAuthenticated } = useAuth();
  const { colors, colorScheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigationRef = useNavigationContainerRef();
  const [pendingShareToken, setPendingShareToken] = useState<string | null>(null);
  const [pendingResetParams, setPendingResetParams] = useState<{ token: string; email: string } | null>(
    null
  );

  // Capture a share or reset-password link whether it opens the app cold
  // (getInitialURL) or the app is already running (the 'url' event) — either
  // way just record it; the effects below decide when it's safe to act on it.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      const shareToken = extractShareToken(url);
      if (shareToken) setPendingShareToken(shareToken);
      const resetParams = extractResetParams(url);
      if (resetParams) setPendingResetParams(resetParams);
    };
    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

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
          screen: 'App',
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
          <RootStack.Screen name="Main" component={MainNavigator} />
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
    failedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    failedTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
    failedMessage: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
    retryLink: { fontSize: 15, color: colors.accent, fontWeight: '600' },
    header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderMuted },
    headerContent: {
      height: 68,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    headerSlot: { width: 60, alignItems: 'flex-start', justifyContent: 'center' },
    headerRightSlot: { alignItems: 'flex-end' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '700', color: colors.textPrimary },
    drawer: { width: 280 },
    drawerContainer: { flex: 1, backgroundColor: colors.surface },
    drawerHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
    drawerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    drawerSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    drawerDivider: { height: 1, backgroundColor: colors.borderMuted },
    drawerScroll: { flex: 1 },
    drawerContent: { paddingTop: 8, paddingHorizontal: 8 },
    drawerFooter: { backgroundColor: colors.surface },
    drawerFooterContent: { paddingTop: 8, paddingBottom: 4, paddingHorizontal: 8 },
    drawerItem: { borderRadius: 10 },
    drawerItemLabel: { fontSize: 15, fontWeight: '600' },
  });
