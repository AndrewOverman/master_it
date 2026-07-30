import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { NavigationContainer, DrawerActions, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import { PlansListScreen } from '../screens/PlansListScreen';

export type AppStackParamList = {
  NewPlan: undefined;
  Generating: { planId: number };
  PlanDetail: { planId: number };
  PlanFailed: { planId: number; message: string | null };
  PlansList: undefined;
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

function HamburgerButton() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
      style={styles.hamburgerButton}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text style={styles.hamburgerIcon}>☰</Text>
    </TouchableOpacity>
  );
}

function AppStackNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: true, headerLeft: () => <HamburgerButton /> }}>
      <AppStack.Screen name="NewPlan" component={NewPlanScreen} options={{ title: 'New Plan' }} />
      <AppStack.Screen
        name="Generating"
        component={GeneratingScreen}
        options={{ title: 'Building your plan', headerBackVisible: false, headerLeft: () => null }}
      />
      <AppStack.Screen name="PlanDetail" component={PlanDetailScreen} options={{ title: 'Your Plan' }} />
      <AppStack.Screen name="PlanFailed" component={PlanFailedScreen} options={{ title: 'Plan Failed' }} />
      <AppStack.Screen name="PlansList" component={PlansListScreen} options={{ title: 'Your Plans' }} />
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

      <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
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

export function RootNavigator() {
  // Check for a stored auth token before deciding whether to land on
  // the login screen or go straight into the app.
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('auth_token').then((token) => {
      setInitialRoute(token ? 'Main' : 'Login');
    });
  }, []);

  if (!initialRoute) {
    return (
      <View style={styles.bootContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Login" component={LoginScreen} />
        <RootStack.Screen name="Main" component={MainNavigator} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  bootContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  failedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  failedTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  failedMessage: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  retryLink: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
  hamburgerButton: { paddingHorizontal: 12, paddingVertical: 6 },
  hamburgerIcon: { fontSize: 20, color: '#111827' },
  drawer: { width: 280 },
  drawerContainer: { flex: 1, backgroundColor: '#fff' },
  drawerHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  drawerTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  drawerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  drawerDivider: { height: 1, backgroundColor: '#F3F4F6' },
  drawerContent: { paddingTop: 8, paddingHorizontal: 8 },
  drawerItem: { borderRadius: 10 },
  drawerItemLabel: { fontSize: 15, fontWeight: '600' },
});
