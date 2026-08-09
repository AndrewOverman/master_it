import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface OfflineNoticeProps {
  /** What the user can't do right now. Defaults to the editing message. */
  message?: string;
  /** Relative time of the last successful fetch, e.g. "2 minutes ago". */
  syncedLabel?: string | null;
  /**
   * Edge-to-edge instead of an inset card — for a notice pinned directly under
   * the header, where side margins would leave a stripe of background.
   */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The single way this app says "you're offline" — every screen renders this
 * one component rather than its own icon-and-text row, so the message can't
 * drift in weight, colour, or wording between screens.
 *
 * An inset card by default, since that reads as a notice rather than as part
 * of the content; `fullWidth` is the exception, for a bar pinned under a
 * header.
 */
export function OfflineNotice({
  message = "Editing is disabled until you're back online.",
  syncedLabel,
  fullWidth = false,
  style,
}: OfflineNoticeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const text = `You're offline${syncedLabel ? ` — synced ${syncedLabel}` : ''}. ${message}`;

  return (
    <View
      style={[styles.container, fullWidth && styles.fullWidth, style]}
      accessibilityRole="alert"
      accessibilityLabel={text}
    >
      <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceMuted,
      marginBottom: spacing.md,
    },
    // Squares off the corners and drops the side inset so the bar can sit
    // flush under a header.
    fullWidth: {
      borderRadius: 0,
      paddingHorizontal: spacing.lg,
      marginBottom: 0,
    },
    // textSecondary, not textMuted: this text sits on surfaceMuted at 12px,
    // and on that background textMuted is only 4.43:1 — under AA.
    // textSecondary is 7.9:1. The icon can stay textMuted, since graphics
    // only need 3:1.
    text: { flex: 1, fontSize: typography.small.fontSize, color: colors.textSecondary },
  });
