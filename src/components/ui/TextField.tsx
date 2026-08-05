import React, { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface TextFieldProps extends TextInputProps {
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, containerStyle, style, multiline, ...rest },
  ref
) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        ref={ref}
        style={[styles.input, multiline && styles.multiline, style]}
        placeholderTextColor={colors.textPlaceholder}
        multiline={multiline}
        {...rest}
      />
    </View>
  );
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { marginBottom: spacing.md },
    label: {
      fontSize: typography.label.fontSize,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: spacing.xs - 2,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
    },
    multiline: { minHeight: 100, textAlignVertical: 'top' },
  });
