import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DrawerActions, useNavigation } from '@react-navigation/native';
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
import { NewPlanScreen } from '../screens/NewPlanScreen';
import { GeneratingScreen } from '../screens/GeneratingScreen';
import { PlanDetailScreen } from '../screens/PlanDetailScreen';
import { StepDetailScreen } from '../screens/StepDetailScreen';
import { PlansListScreen } from '../screens/PlansListScreen';
import { FeaturedPlansScreen } from '../screens/FeaturedPlansScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { AuthProvider, useAuth } from '../context/AuthContext';

export type AppStackParamList = {
  Featured: undefined;
  NewPlan: undefined;
  Generating: { planId: number };
  PlanDetail: { planId: number };
  StepDetail: { planId: number; stepId: number };
  PlanFailed: { planId: number; message: string | null };
  PlansList: undefined;
  Settings: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Drawer = createDrawerNavigator();

// Minimal fallback screen if generation fails server-side
function PlanFailedScreen({ route, navigation }: any) {
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

function BackButton() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="chevron-back" size={28} color="#111827" />
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
              <Text style={styles.hamburgerIcon}>☰</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {options.title}
        </Text>
        <View style={styles.headerSlot} />
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
      <AppStack.Screen name="PlanDetail" component={PlanDetailScreen} options={{ title: 'My Plan' }} />
      <AppStack.Screen
        name="StepDetail"
        component={StepDetailScreen}
        options={{ title: 'Step', headerLeft: () => <BackButton /> }}
      />
      <AppStack.Screen name="PlanFailed" component={PlanFailedScreen} options={{ title: 'Plan Failed' }} />
      <AppStack.Screen name="PlansList" component={PlansListScreen} options={{ title: 'My Plans' }} />

      <AppStack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
      <AppStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      
    </AppStack.Navigator>
  );
}

function DrawerContent(props: DrawerContentComponentProps) {
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
          activeTintColor="#111827"
          inactiveTintColor="#374151"
          activeBackgroundColor="#F3F4F6"
          pressColor="#F3F4F6"
          style={styles.drawerItem}
          onPress={() => {
            props.navigation.navigate('App', { screen: 'Featured' });
            props.navigation.dispatch(DrawerActions.closeDrawer());
          }}
        />
        <DrawerItem
          label="New Plan"
          labelStyle={styles.drawerItemLabel}
          icon={({ size, color }) => <Ionicons name="add-circle-outline" size={size} color={color} />}
          activeTintColor="#111827"
          inactiveTintColor="#374151"
          activeBackgroundColor="#F3F4F6"
          pressColor="#F3F4F6"
          style={styles.drawerItem}
          onPress={() => {
            props.navigation.navigate('App', { screen: 'NewPlan' });
            props.navigation.dispatch(DrawerActions.closeDrawer());
          }}
        />
        <DrawerItem
          label="Plans"
          labelStyle={styles.drawerItemLabel}
          icon={({ size, color }) => <Ionicons name="list-outline" size={size} color={color} />}
          activeTintColor="#111827"
          inactiveTintColor="#374151"
          activeBackgroundColor="#F3F4F6"
          pressColor="#F3F4F6"
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
            label="Settings"
            labelStyle={styles.drawerItemLabel}
            icon={({ size, color }) => <Ionicons name="settings-outline" size={size} color={color} />}
            activeTintColor="#111827"
            inactiveTintColor="#374151"
            activeBackgroundColor="#F3F4F6"
            pressColor="#F3F4F6"
            style={styles.drawerItem}
            onPress={() => {
              props.navigation.navigate('App', { screen: 'Settings' });
              props.navigation.dispatch(DrawerActions.closeDrawer());
            }}
          />
          <DrawerItem
            label="Account"
            labelStyle={styles.drawerItemLabel}
            icon={({ size, color }) => <Ionicons name="person-circle-outline" size={size} color={color} />}
            activeTintColor="#111827"
            inactiveTintColor="#374151"
            activeBackgroundColor="#F3F4F6"
            pressColor="#F3F4F6"
            style={styles.drawerItem}
            onPress={() => {
              props.navigation.navigate('App', { screen: 'Account' });
              props.navigation.dispatch(DrawerActions.closeDrawer());
            }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function MainNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: styles.drawer,
        overlayColor: 'rgba(17, 24, 39, 0.4)',
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

  if (isAuthenticated === null) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="Main" component={MainNavigator} />
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
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

const styles = StyleSheet.create({
  bootContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  failedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  failedTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  failedMessage: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  retryLink: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerContent: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerSlot: { width: 60, alignItems: 'flex-start', justifyContent: 'center' },
  hamburgerIcon: { fontSize: 30, color: '#111827' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 19, fontWeight: '700', color: '#111827' },
  drawer: { width: 280 },
  drawerContainer: { flex: 1, backgroundColor: '#fff' },
  drawerHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  drawerTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  drawerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  drawerDivider: { height: 1, backgroundColor: '#F3F4F6' },
  drawerScroll: { flex: 1 },
  drawerContent: { paddingTop: 8, paddingHorizontal: 8 },
  drawerFooter: { backgroundColor: '#fff' },
  drawerFooterContent: { paddingTop: 8, paddingBottom: 4, paddingHorizontal: 8 },
  drawerItem: { borderRadius: 10 },
  drawerItemLabel: { fontSize: 15, fontWeight: '600' },
});
