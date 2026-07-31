import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export function SettingsScreen() {
  const { signOut } = useAuth();

  const handleLogOut = () => {
    Alert.alert('Log out?', "You'll need to sign back in to access your plans.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.row} onPress={handleLogOut}>
        <Ionicons name="log-out-outline" size={22} color="#DC2626" />
        <Text style={styles.rowLabel}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  rowLabel: { fontSize: 16, fontWeight: '600', color: '#DC2626', marginLeft: 12 },
});
