import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface OfflineNoticeProps {
  /**
   * What the user can't do right now. Defaults to the editing message, which
   * is what three of the four call sites were already saying.
   */
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
 * The single way this app says "you're offline".
 *
 * There were three: an edge-to-edge bar on Explore, a rounded card inside the
 * list on All Plans, and a bare icon+text row on Plan and Step Detail — three
 * different weights and two different text colours for the same message. The
 * inset card is the one that survives, since it reads as a notice rather than
 * as part of the content.
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
    // textSecondary, not the textMuted/textPlaceholder the old three versions
    // used. This text sits on surfaceMuted at 12px, and on that background
    // textMuted is only 4.43:1 — under AA. textSecondary is 7.9:1. The icon
    // can stay textMuted, since graphics only need 3:1.
    text: { flex: 1, fontSize: typography.small.fontSize, color: colors.textSecondary },
  });
