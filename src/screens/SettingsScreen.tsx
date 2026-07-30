import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="settings-outline" size={40} color="#9CA3AF" />
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 12 },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 6 },
});
