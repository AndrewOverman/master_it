import React, { useMemo } from 'react';
import { StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface SettingsSwitchProps {
  label: string;
  /** The one-line explanation under the label. Optional, but a switch whose
   *  effect isn't obvious from two words should always have one. */
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A labelled toggle row.
 *
 * Wraps React Native's own Switch rather than hand-rolling one: it already
 * renders the platform-native control, and — more to the point — it carries
 * the correct accessibility semantics, which the hand-rolled checkboxes
 * elsewhere in this app each had to reimplement.
 *
 * The whole row is one accessibility element, so a screen reader announces
 * "Reminders, on" instead of a stray label followed by an unlabelled
 * switch.
 */
export function SettingsSwitch({
  label,
  hint,
  value,
  onValueChange,
  disabled = false,
  style,
}: SettingsSwitchProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={styles.text}>
        <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.accent }}
        // Excluded from the accessibility tree: the wrapping row above is
        // already the switch as far as a screen reader is concerned, and
        // leaving this focusable would announce the control twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      // Matches the 44pt minimum the rest of Settings uses for tap targets.
      minHeight: 44,
      paddingVertical: spacing.xs,
    },
    text: { flex: 1 },
    label: {
      fontSize: typography.body.fontSize,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    labelDisabled: { color: colors.textMuted },
    hint: {
      fontSize: typography.small.fontSize,
      lineHeight: typography.small.lineHeight,
      color: colors.textMuted,
      marginTop: 2,
    },
  });
