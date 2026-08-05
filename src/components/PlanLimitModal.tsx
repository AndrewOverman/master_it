import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button } from './ui';
import { shadows } from '../theme/shadows';

interface PlanLimitModalProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
}

// Shown when a copy (or create) attempt is rejected because it would put
// the user over their plan limit — replaces the generic native Alert with
// something on-brand, since this is a distinct, expected outcome rather
// than a bug.
export function PlanLimitModal({ visible, message, onDismiss }: PlanLimitModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.textMuted} style={styles.icon} />
          <Text style={styles.title}>Plan limit reached</Text>
          <Text style={styles.message}>{message}</Text>
          <Button label="Got it" onPress={onDismiss} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingVertical: 28,
      paddingHorizontal: 24,
      alignItems: 'center',
      ...shadows.card,
    },
    icon: { marginBottom: 12 },
    title: { fontSize: 19, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
    message: { fontSize: 14.5, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    button: { paddingHorizontal: 32, alignSelf: 'stretch' },
  });
