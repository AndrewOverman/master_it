import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { forgotPassword } from '../api/auth';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, TextField, Logo } from '../components/ui';
import { getApiErrorMessage } from '../utils/apiError';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function ForgotPasswordScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => forgotPassword({ email: email.trim() }),
    onSuccess: () => setSentTo(email.trim()),
    onError: (error) => {
      Alert.alert('Something went wrong', getApiErrorMessage(error, 'Could not send a reset link. Please try again.'));
    },
  });

  const handleSubmit = () => {
    const problem = !email.trim()
      ? 'Enter your email address.'
      : !/^\S+@\S+\.\S+$/.test(email.trim())
        ? 'That doesn’t look like an email address.'
        : null;

    setEmailError(problem);
    if (problem) return;
    mutation.mutate();
  };

  if (sentTo) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          <View style={styles.brandHeader}>
            <Logo />
          </View>
          <Text style={styles.heading}>Check your email</Text>
          <Text style={styles.subheading}>
            If an account exists for {sentTo}, we've sent a link to reset your password.
          </Text>
          <Button label="Back to log in" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.avoider} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.brandHeader}>
            <Logo />
          </View>
          <Text style={styles.heading}>Reset your password</Text>
          <Text style={styles.subheading}>Enter your email and we'll send you a link to reset it.</Text>

          <TextField
            placeholder="Email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="username"
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            editable={!mutation.isPending}
            error={emailError}
          />

          <Button label="Send reset link" onPress={handleSubmit} loading={mutation.isPending} />

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => navigation.goBack()}
            disabled={mutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Back to log in"
          >
            <Text style={styles.toggleText}>Back to log in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    avoider: { flex: 1 },
    brandHeader: { alignItems: 'center', marginBottom: spacing.xxl },
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
