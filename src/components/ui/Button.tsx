import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type TouchableOpacityProps } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: TouchableOpacityProps['style'];
}

export function Button({ label, variant = 'primary', loading = false, disabled, style, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDisabled = disabled || loading;
  const isOnFill = variant === 'primary' || variant === 'destructive';

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isOnFill ? colors.background : colors.textSecondary} />
      ) : (
        <Text style={[styles.label, isOnFill ? styles.labelOnFill : styles.labelOnOutline]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    destructive: { backgroundColor: colors.destructive },
    disabled: { opacity: 0.6 },
    label: { fontSize: typography.bodyMedium.fontSize, fontWeight: '600' },
    labelOnFill: { color: colors.background },
    labelOnOutline: { color: colors.textSecondary },
  });
