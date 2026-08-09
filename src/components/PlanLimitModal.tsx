import { useMemo } from 'react';
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
  // Named by the caller rather than defaulted here — the wording has to say
  // "monthly allowance", not "cap on how many plans you may keep", or it
  // implies the user has to delete something to continue.
  title: string;
  // The way out. Telling someone they're out of generations and offering
  // only a dismiss button is a dead end at the exact moment they've shown
  // intent to keep going.
  onUpgrade: () => void;
  onDismiss: () => void;
}

// Shown when creating or refining a plan is rejected for being over the
// user's monthly generation allowance — an on-brand modal rather than a
// native Alert, since this is a distinct, expected outcome rather than a bug.
// (Copying a featured or shared plan has no allowance and never lands here.)
export function PlanLimitModal({ visible, message, title, onUpgrade, onDismiss }: PlanLimitModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.textMuted} style={styles.icon} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <Button label="See plans" onPress={onUpgrade} style={styles.button} />
          <Button
            label="Not now"
            variant="secondary"
            onPress={onDismiss}
            style={[styles.button, styles.secondaryButton]}
          />
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
