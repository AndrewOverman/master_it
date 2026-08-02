import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { login, register } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

export function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
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
    onError: () => {
      Alert.alert(
        'Something went wrong',
        mode === 'login'
          ? 'Check your email and password and try again.'
          : 'Could not create an account. That email may already be taken.'
      );
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

        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor={colors.textPlaceholder}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            editable={!mutation.isPending}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textPlaceholder}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!mutation.isPending}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textPlaceholder}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!mutation.isPending}
        />

        <TouchableOpacity
          style={[styles.submitButton, mutation.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.submitButtonText}>{mode === 'login' ? 'Log In' : 'Sign Up'}</Text>
          )}
        </TouchableOpacity>

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
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    submitButton: {
      backgroundColor: colors.textPrimary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: { color: colors.background, fontSize: 16, fontWeight: '600' },
    toggleButton: { marginTop: 20, alignItems: 'center' },
    toggleText: { fontSize: 14, color: colors.link, fontWeight: '600' },
  });
