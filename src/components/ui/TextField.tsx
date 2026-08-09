import { forwardRef, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface TextFieldProps extends TextInputProps {
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * Validation message for this field. Setting it reddens the border and
   * prints the message underneath, rather than raising an `Alert` that
   * interrupts, blocks, and never says which field is wrong.
   */
  error?: string | null;
  /** Persistent guidance shown under the field while there's no error. */
  hint?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, containerStyle, style, multiline, error, hint, secureTextEntry, ...rest },
  ref
) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [revealed, setRevealed] = useState(false);

  // Every password box in the app gets a reveal toggle, rather than each
  // screen remembering to ask for one. Typing a generated or mixed-case
  // password blind is where sign-in most often goes wrong.
  const isPassword = !!secureTextEntry;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputWrap}>
        <TextInput
          ref={ref}
          style={[
            styles.input,
            multiline && styles.multiline,
            isPassword && styles.inputWithToggle,
            !!error && styles.inputError,
            style,
          ]}
          placeholderTextColor={colors.textPlaceholder}
          multiline={multiline}
          secureTextEntry={isPassword && !revealed}
          // VoiceOver otherwise reads the field and its error as two unrelated
          // items, so the error has to be part of what the field announces.
          accessibilityLabel={
            error ? `${label ?? rest.placeholder ?? 'Field'}. Error: ${error}` : undefined
          }
          {...rest}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.toggle}
            onPress={() => setRevealed((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
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
    inputWrap: { justifyContent: 'center' },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
    },
    multiline: { minHeight: 100, textAlignVertical: 'top' },
    // Keeps typed text from running underneath the reveal button.
    inputWithToggle: { paddingRight: 52 },
    toggle: {
      position: 'absolute',
      right: 0,
      // 44×44 is the documented minimum target on both platforms; the icon is
      // 20pt, so the button carries the rest as padding.
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputError: { borderColor: colors.destructive },
    errorText: {
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      color: colors.destructive,
      marginTop: spacing.xs - 2,
    },
    hintText: {
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      color: colors.textMuted,
      marginTop: spacing.xs - 2,
    },
  });
