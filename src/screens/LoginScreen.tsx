import { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { login, register } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, TextField, Logo } from '../components/ui';
import { getApiErrorMessage } from '../utils/apiError';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../lib/legal';
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

type FieldName = 'name' | 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

// Laravel's 422 body is { errors: { email: ["..."], ... } }. Pulling those
// onto the fields they name is the whole point of the inline pattern —
// "The email has already been taken." belongs under the email box, not in an
// alert that covers the form it's talking about.
function fieldErrorsFromResponse(error: any): FieldErrors | null {
  const errors = error?.response?.data?.errors;
  if (!errors || typeof errors !== 'object') return null;

  const mapped: FieldErrors = {};
  for (const field of ['name', 'email', 'password'] as FieldName[]) {
    const messages = errors[field];
    if (Array.isArray(messages) && typeof messages[0] === 'string') {
      mapped[field] = messages[0];
    }
  }
  return Object.keys(mapped).length > 0 ? mapped : null;
}

export function LoginScreen({ navigation }: any) {
  const { signIn, sessionExpired } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  // Clearing on edit is what keeps the inline errors from going stale —
  // otherwise a message sits under a field the user has already fixed.
  const setField = (field: FieldName, setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    // The two modes don't validate the same way (password length only applies
    // to signup), so carrying errors across would strand messages that no
    // longer apply.
    setErrors({});
  };

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'login' ? login({ email, password }) : register({ name, email, password }),
    onSuccess: async (data) => {
      // Flips isAuthenticated in RootNavigator, which swaps to Main —
      // no explicit navigation call needed.
      await signIn(data.token, data.user.id);
    },
    onError: (error) => {
      const fieldErrors = fieldErrorsFromResponse(error);
      if (fieldErrors) {
        setErrors(fieldErrors);
        return;
      }
      // Nothing field-specific to point at (bad credentials, network, 5xx),
      // so this one stays an alert.
      Alert.alert('Something went wrong', getAuthErrorMessage(error, mode));
    },
  });

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};

    if (mode === 'register' && !name.trim()) {
      next.name = 'Enter your name.';
    }

    if (!email.trim()) {
      next.email = 'Enter your email address.';
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = 'That doesn’t look like an email address.';
    }

    if (!password) {
      next.password = 'Enter your password.';
    } else if (mode === 'register' && password.length < 8) {
      // Mirrors Password::min(8) on the backend. The mixed-case and number
      // rules are left to the server, which reports them per-field and now
      // lands them under this same input.
      next.password = 'Use at least 8 characters.';
    }

    return next;
  };

  const handleSubmit = () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    mutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.brandHeader}>
            <Logo />
          </View>

          <Text style={styles.heading}>{mode === 'login' ? 'Welcome back' : 'Create an account'}</Text>
          <Text style={styles.subheading}>
            {mode === 'login' ? 'Log in to build and track your plans.' : 'Sign up to get started.'}
          </Text>

          {sessionExpired && (
            <View style={styles.sessionBanner}>
              <Text style={styles.sessionBannerText}>Your session expired — log back in</Text>
            </View>
          )}

          {/*
            textContentType (iOS) and autoComplete (Android) are what make the
            OS offer a saved login, and `newPassword` in register mode is what
            triggers the strong-password generator. Without them a password
            manager has nothing to attach to, which made signing in feel
            broken. returnKeyType/onSubmitEditing chain the fields so the
            keyboard never has to be dismissed mid-form.
          */}
          {mode === 'register' && (
            <TextField
              placeholder="Name"
              value={name}
              onChangeText={setField('name', setName)}
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailInputRef.current?.focus()}
              submitBehavior="submit"
              editable={!mutation.isPending}
              error={errors.name}
            />
          )}
          <TextField
            ref={emailInputRef}
            placeholder="Email"
            value={email}
            onChangeText={setField('email', setEmail)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType={mode === 'login' ? 'username' : 'emailAddress'}
            autoComplete={mode === 'login' ? 'username' : 'email'}
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            submitBehavior="submit"
            editable={!mutation.isPending}
            error={errors.email}
          />
          <TextField
            ref={passwordInputRef}
            placeholder="Password"
            value={password}
            onChangeText={setField('password', setPassword)}
            secureTextEntry
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            editable={!mutation.isPending}
            error={errors.password}
            hint={mode === 'register' ? 'At least 8 characters, with a number and mixed case.' : undefined}
          />

          {mode === 'login' && (
            <TouchableOpacity
              style={styles.forgotPasswordLink}
              onPress={() => navigation.navigate('ForgotPassword')}
              disabled={mutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Forgot password?"
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <Button
            label={mode === 'login' ? 'Log In' : 'Sign Up'}
            onPress={handleSubmit}
            loading={mutation.isPending}
          />

          {/* Apple expects these alongside account creation, not just on the
              store listing. Only shown in register mode — that's the point at
              which the user is agreeing to something. */}
          {mode === 'register' && (
            <Text style={styles.legalText}>
              By signing up you agree to our{' '}
              <Text
                style={styles.legalLink}
                onPress={() => Linking.openURL(TERMS_URL)}
                accessibilityRole="link"
                accessibilityLabel="Terms of Service, opens in your browser"
              >
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                style={styles.legalLink}
                onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
                accessibilityRole="link"
                accessibilityLabel="Privacy Policy, opens in your browser"
              >
                Privacy Policy
              </Text>
              .
            </Text>
          )}

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={switchMode}
            disabled={mutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'login' ? 'Switch to creating an account' : 'Switch to logging in'
            }
          >
            <Text style={styles.toggleText}>
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </Text>
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
    subheading: { fontSize: typography.bodyMedium.fontSize, color: colors.textMuted, marginTop: 6, marginBottom: 28 },
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
    legalText: {
      fontSize: typography.small.fontSize,
      lineHeight: typography.small.lineHeight,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    legalLink: { color: colors.accent, fontWeight: '600' },
    toggleButton: { marginTop: spacing.lg, alignItems: 'center' },
    toggleText: { fontSize: typography.label.fontSize, color: colors.accent, fontWeight: '600' },
  });
