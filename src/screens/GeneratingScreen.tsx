import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getPlan } from '../api/plans';

// Polls GET /api/v1/plans/{id} until the queued generation job finishes,
// then routes to the appropriate next screen.
export function GeneratingScreen({ route, navigation }: any) {
  const { planId } = route.params;

  const { data: plan } = useQuery({
    queryKey: ['plan', planId],
    queryFn: () => getPlan(planId),
    refetchInterval: (query) => (query.state.data?.status === 'generating' ? 2000 : false),
  });

  useEffect(() => {
    if (!plan) return;
    if (plan.status === 'ready') {
      navigation.replace('PlanDetail', { planId });
    } else if (plan.status === 'failed') {
      navigation.replace('PlanFailed', { planId, message: plan.error_message });
    }
  }, [plan, navigation, planId]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#111827" />
      <Text style={styles.title}>Building your plan…</Text>
      <Text style={styles.subtitle}>This usually takes a few seconds.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 20 },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 6 },
});
