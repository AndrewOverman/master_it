import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button } from './ui';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

interface PlanLimitModalProps {
  visible: boolean;
  message: string;
  // Defaults to the copy limit's wording. Generation limits (creating or
  // refining a plan) pass their own — those are a monthly allowance, not a
  // cap on how many plans you may keep, and saying so avoids implying the
  // user has to delete something to continue.
  title?: string;
  // The way out. Without it this modal tells someone they're out of
  // generations and offers only "Got it" — a dead end at the exact moment
  // they've shown intent to keep going.
  onUpgrade?: () => void;
  onDismiss: () => void;
}

// Shown when a copy (or create) attempt is rejected because it would put
// the user over their plan limit — replaces the generic native Alert with
// something on-brand, since this is a distinct, expected outcome rather
// than a bug.
export function PlanLimitModal({
  visible,
  message,
  title = 'Plan limit reached',
  onUpgrade,
  onDismiss,
}: PlanLimitModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.textMuted} style={styles.icon} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {onUpgrade ? (
            <>
              <Button label="See plans" onPress={onUpgrade} style={styles.button} />
              <Button
                label="Not now"
                variant="secondary"
                onPress={onDismiss}
                style={[styles.button, styles.secondaryButton]}
              />
            </>
          ) : (
            <Button label="Got it" onPress={onDismiss} style={styles.button} />
          )}
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
      padding: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      paddingVertical: 28,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      ...shadows.card,
    },
    icon: { marginBottom: spacing.sm },
    title: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
    message: { fontSize: typography.label.fontSize, color: colors.textSecondary, textAlign: 'center', lineHeight: typography.label.lineHeight, marginBottom: spacing.lg },
    button: { paddingHorizontal: spacing.xxl, alignSelf: 'stretch' },
    secondaryButton: { marginTop: spacing.xs },
  });
