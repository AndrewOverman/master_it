import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme, type ThemePreference } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

const THEME_OPTIONS: { label: string; value: ThemePreference; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Light', value: 'light', icon: 'sunny-outline' },
  { label: 'Dark', value: 'dark', icon: 'moon-outline' },
  { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
];

export function SettingsScreen() {
  const { signOut } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogOut = () => {
    Alert.alert('Log out?', "You'll need to sign back in to access your plans.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Appearance</Text>
      <View style={styles.themeRow}>
        {THEME_OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.themeOption, selected && styles.themeOptionSelected]}
              onPress={() => setPreference(option.value)}
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

      <TouchableOpacity style={styles.row} onPress={handleLogOut}>
        <Ionicons name="log-out-outline" size={22} color={colors.destructive} />
        <Text style={styles.rowLabel}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 20 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 10 },
    themeRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
    themeOption: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 6,
    },
    themeOptionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    themeOptionText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    themeOptionTextSelected: { color: colors.background },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderMuted,
    },
    rowLabel: { fontSize: 16, fontWeight: '600', color: colors.destructive, marginLeft: 12 },
  });
