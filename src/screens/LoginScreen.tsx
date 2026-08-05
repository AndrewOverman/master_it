import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { login, register } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, TextField } from '../components/ui';
import { getApiErrorMessage } from '../utils/apiError';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

function getAuthErrorMessage(error: unknown, mode: 'login' | 'register'): string {
  const fallback =
    mode === 'login'
      ? 'Check your email and password and try again.'
      : 'Could not create an account. That email may already be taken.';

  return getApiErrorMessage(error, fallback);
}

export function LoginScreen({ navigation }: any) {
  const { signIn, sessionExpired } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'login' ? login({ email, password }) : register({ name, email, password }),
    onSuccess: async (data) => {
      // Flips isAuthenticated in RootNavigator, which swaps to Main —
      // no explicit navigation call needed.
      await signIn(data.token);
    },
    onError: (error) => {
      Alert.alert('Something went wrong', getAuthErrorMessage(error, mode));
    },
  });

  const handleSubmit = () => {
    if (!email.trim() || !password.trim() || (mode === 'register' && !name.trim())) {
      Alert.alert('Missing info', 'Please fill in all fields.');
      return;
    }
    mutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.heading}>{mode === 'login' ? 'Welcome back' : 'Create an account'}</Text>
        <Text style={styles.subheading}>
          {mode === 'login' ? 'Log in to build and track your plans.' : 'Sign up to get started.'}
        </Text>

        {sessionExpired && (
          <View style={styles.sessionBanner}>
            <Text style={styles.sessionBannerText}>Your session expired — log back in</Text>
          </View>
        )}

        {mode === 'register' && (
          <TextField
            placeholder="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            editable={!mutation.isPending}
          />
        )}
        <TextField
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!mutation.isPending}
        />
        <TextField
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!mutation.isPending}
        />

        {mode === 'login' && (
          <TouchableOpacity
            style={styles.forgotPasswordLink}
            onPress={() => navigation.navigate('ForgotPassword')}
            disabled={mutation.isPending}
          >
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        <Button
          label={mode === 'login' ? 'Log In' : 'Sign Up'}
          onPress={handleSubmit}
          loading={mutation.isPending}
        />

        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          disabled={mutation.isPending}
        >
          <Text style={styles.toggleText}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', padding: 24 },
    heading: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
    subheading: { fontSize: 15, color: colors.textMuted, marginTop: 6, marginBottom: 28 },
    sessionBanner: {
      backgroundColor: colors.accentMuted,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
    },
    sessionBannerText: {
      color: colors.accent,
      fontSize: typography.label.fontSize,
      fontWeight: '600',
      textAlign: 'center',
    },
    forgotPasswordLink: { alignItems: 'flex-end', marginBottom: spacing.lg },
    forgotPasswordText: { fontSize: typography.label.fontSize, color: colors.accent, fontWeight: '600' },
    toggleButton: { marginTop: 20, alignItems: 'center' },
    toggleText: { fontSize: 14, color: colors.accent, fontWeight: '600' },
  });
