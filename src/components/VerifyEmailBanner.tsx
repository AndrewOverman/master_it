import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getCurrentUser, resendVerificationEmail } from '../api/auth';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

interface VerifyEmailBannerProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * Shown until the account's email address is confirmed.
 *
 * Reads the shared ['user'] cache itself rather than taking the user as a
 * prop, so it can be dropped onto any screen without that screen having to
 * know about verification. Renders nothing at all until the query resolves —
 * flashing "verify your email" at someone who already has is worse than
 * showing the banner a beat late.
 *
 * Deliberately not dismissible: unverified accounts can't generate plans
 * (POST /plans is behind the `verified` middleware), so this is the only
 * standing explanation of why the app's main action is blocked.
 */
export function VerifyEmailBanner({ style }: VerifyEmailBannerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sent, setSent] = useState(false);

  const { data: user } = useQuery({ queryKey: ['user'], queryFn: getCurrentUser });

  const resend = useMutation({
    mutationFn: resendVerificationEmail,
    onSuccess: () => setSent(true),
  });

  if (user?.email_verified !== false) return null;

  return (
    <View style={[styles.container, style]} accessibilityRole="alert">
      <Ionicons name="mail-unread-outline" size={16} color={colors.accent} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.text}>
          {sent
            ? `We've sent a new link to ${user.email}. Tap it to finish setting up your account.`
            : `Verify ${user.email} to start generating plans. Check your inbox for the link.`}
        </Text>
        {/* Hidden once sent — a "Resend" that's been tapped and is rate
            limited to two a minute invites a second tap that can only fail. */}
        {!sent && (
          <TouchableOpacity
            onPress={() => resend.mutate()}
            disabled={resend.isPending}
            accessibilityRole="button"
            accessibilityLabel="Resend verification email"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.action}>
              {resend.isPending ? 'Sending…' : 'Resend email'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceMuted,
      marginBottom: spacing.md,
    },
    icon: { marginTop: 1 },
    body: { flex: 1, gap: spacing.xxs },
    // textSecondary rather than textMuted for the same contrast reason
    // OfflineNotice documents — small text on surfaceMuted.
    text: { fontSize: typography.small.fontSize, color: colors.textSecondary, lineHeight: 18 },
    action: { fontSize: typography.small.fontSize, fontWeight: '600', color: colors.accent },
  });
