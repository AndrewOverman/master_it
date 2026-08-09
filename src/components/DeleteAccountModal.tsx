import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { deleteAccount } from '../api/auth';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { shadows } from '../theme/shadows';
import { Button, TextField } from './ui';

interface DeleteAccountModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** Called once the account is actually gone, to drop the local session. */
  onDeleted: () => void;
}

/**
 * Account deletion, required in-app by App Store Guideline 5.1.1(v).
 *
 * Password-confirmed rather than a plain "are you sure": this deletes every
 * plan the user has (plans cascade on the user row), and it can't be undone,
 * so a mis-tap shouldn't be able to reach it. That matches the backend, which
 * requires the password on DELETE /user regardless of what the client asks.
 */
export function DeleteAccountModal({ visible, onDismiss, onDeleted }: DeleteAccountModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => deleteAccount({ password }),
    onSuccess: () => {
      setPassword('');
      setError(null);
      onDeleted();
    },
    onError: (err: any) => {
      // The wrong-password case comes back as a 422 keyed on `password`, so it
      // belongs under the field rather than in an alert over the top of it.
      const fieldError = err?.response?.data?.errors?.password;
      setError(
        (Array.isArray(fieldError) ? fieldError[0] : null) ??
          err?.response?.data?.message ??
          'Could not delete your account. Please try again.'
      );
    },
  });

  const handleDismiss = () => {
    if (mutation.isPending) return;
    setPassword('');
    setError(null);
    onDismiss();
  };

  const handleConfirm = () => {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.message}>
            This permanently deletes your account and every plan in it. It can't be undone.
          </Text>

          <TextField
            label="Confirm your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            editable={!mutation.isPending}
            error={error}
          />

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={handleDismiss}
              disabled={mutation.isPending}
              style={styles.action}
            />
            <Button
              label="Delete"
              variant="destructive"
              onPress={handleConfirm}
              loading={mutation.isPending}
              style={styles.action}
            />
          </View>
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
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.xl,
      ...shadows.card,
    },
    title: {
      fontSize: typography.h3.fontSize,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    message: {
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    action: { flex: 1 },
  });
