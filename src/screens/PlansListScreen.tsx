import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { listPlans } from '../api/plans';
import type { Plan } from '../types/plan';

export function PlansListScreen({ navigation }: any) {
  const {
    data: plans,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['plans'],
    queryFn: listPlans,
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>You haven't created any plans yet.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Plan }) => (
    <TouchableOpacity
      style={styles.planRow}
      onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}
    >
      <Text style={styles.planTitle}>{item.title}</Text>
      <Text style={styles.planMeta}>
        {item.status === 'ready'
          ? `${item.steps.filter((s) => s.completed_at).length}/${item.steps.length} steps complete`
          : item.status}
      </Text>
    </TouchableOpacity>
  );

  return (
    <FlatList
      data={plans}
      keyExtractor={(plan) => String(plan.id)}
      contentContainerStyle={styles.list}
      renderItem={renderItem}
      refreshing={isRefetching}
      onRefresh={refetch}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#6B7280', textAlign: 'center' },
  list: { padding: 20, flexGrow: 1 },
  planRow: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  planTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  planMeta: { fontSize: 13, color: '#6B7280', marginTop: 4, textTransform: 'capitalize' },
});
