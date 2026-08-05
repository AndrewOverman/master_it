import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { forgotPassword } from '../api/auth';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, TextField } from '../components/ui';
import { getApiErrorMessage } from '../utils/apiError';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function ForgotPasswordScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => forgotPassword({ email: email.trim() }),
    onSuccess: () => setSentTo(email.trim()),
    onError: (error) => {
      Alert.alert('Something went wrong', getApiErrorMessage(error, 'Could not send a reset link. Please try again.'));
    },
  });

  const handleSubmit = () => {
    if (!email.trim()) {
      Alert.alert('Missing info', 'Please enter your email.');
      return;
    }
    mutation.mutate();
  };

  if (sentTo) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.heading}>Check your email</Text>
          <Text style={styles.subheading}>
            If an account exists for {sentTo}, we've sent a link to reset your password.
          </Text>
          <Button label="Back to log in" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <Text style={styles.heading}>Reset your password</Text>
        <Text style={styles.subheading}>Enter your email and we'll send you a link to reset it.</Text>

        <TextField
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!mutation.isPending}
        />

        <Button label="Send reset link" onPress={handleSubmit} loading={mutation.isPending} />

        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => navigation.goBack()}
          disabled={mutation.isPending}
        >
          <Text style={styles.toggleText}>Back to log in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', padding: spacing.xl },
    heading: { fontSize: typography.h1.fontSize, fontWeight: '700', color: colors.textPrimary },
    subheading: {
      fontSize: typography.body.fontSize,
      color: colors.textMuted,
      marginTop: spacing.xxs + 2,
      marginBottom: spacing.xxl - 4,
    },
    toggleButton: { marginTop: spacing.lg, alignItems: 'center' },
    toggleText: { fontSize: typography.label.fontSize, color: colors.accent, fontWeight: '600' },
  });
