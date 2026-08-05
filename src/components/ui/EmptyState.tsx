import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title?: string;
  message: string;
  // Fills the screen (matches the `centered` full-screen loading/empty
  // pattern); set false to sit inline within a list header/footer instead.
  fullScreen?: boolean;
}

export function EmptyState({ icon, title, message, fullScreen = true }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={fullScreen ? styles.fullScreen : styles.inline}>
      {icon && <Ionicons name={icon} size={28} color={colors.textPlaceholder} />}
      {title && <Text style={styles.title}>{title}</Text>}
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    fullScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      padding: spacing.xl,
      gap: spacing.xs + 2,
    },
    inline: { alignItems: 'center', padding: spacing.xl, gap: spacing.xs + 2 },
    title: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    message: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  });
