import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NewPlanScreen } from '../screens/NewPlanScreen';
import { GeneratingScreen } from '../screens/GeneratingScreen';
import { PlanDetailScreen } from '../screens/PlanDetailScreen';

export type RootStackParamList = {
  NewPlan: undefined;
  Generating: { planId: number };
  PlanDetail: { planId: number };
  PlanFailed: { planId: number; message: string | null };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        <Stack.Screen
          name="NewPlan"
          component={NewPlanScreen}
          options={{ title: 'New Plan' }}
        />
        <Stack.Screen
          name="Generating"
          component={GeneratingScreen}
          options={{ title: 'Building your plan', headerBackVisible: false }}
        />
        <Stack.Screen
          name="PlanDetail"
          component={PlanDetailScreen}
          options={{ title: 'Your Plan' }}
        />
        <Stack.Screen
          name="PlanFailed"
          component={PlanFailedScreen}
          options={{ title: 'Plan Failed' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  failedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  failedTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  failedMessage: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  retryLink: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
});
