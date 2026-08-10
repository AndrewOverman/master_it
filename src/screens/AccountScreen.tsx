import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, type TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, updateProfile } from '../api/auth';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, Spinner, TextField } from '../components/ui';
import { VerifyEmailBanner } from '../components/VerifyEmailBanner';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

// Prefers the specific field validation message (e.g. "The email has
// already been taken.") over Laravel's generic top-level message.
function extractErrorMessage(error: any, fallback: string): string {
  const errors = error?.response?.data?.errors;
  const firstError = errors ? Object.values(errors)[0] : null;
  return (Array.isArray(firstError) ? firstError[0] : null) ?? error?.response?.data?.message ?? fallback;
}

// Same idea as extractErrorMessage but keyed by field, so a 422 lands under
// the input it's about instead of in a modal on top of the form.
function fieldErrorsFromResponse<T extends string>(error: any, fields: readonly T[]) {
  const errors = error?.response?.data?.errors;
  if (!errors || typeof errors !== 'object') return null;

  const mapped: Partial<Record<T, string>> = {};
  for (const field of fields) {
    const messages = errors[field];
    if (Array.isArray(messages) && typeof messages[0] === 'string') {
      mapped[field] = messages[0];
    }
  }
  return Object.keys(mapped).length > 0 ? mapped : null;
}

type ProfileField = 'name' | 'email';
type PasswordField = 'current_password' | 'password' | 'confirmPassword';

export function AccountScreen() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: getCurrentUser,
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileErrors, setProfileErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [passwordErrors, setPasswordErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const emailInputRef = useRef<TextInput>(null);
  const newPasswordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const profileMutation = useMutation({
    mutationFn: () => updateProfile({ name: name.trim(), email: email.trim() }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['user'], updated);
      setProfileErrors({});
      Alert.alert('Saved', 'Your profile has been updated.');
    },
    onError: (error: any) => {
      const fieldErrors = fieldErrorsFromResponse(error, ['name', 'email'] as const);
      if (fieldErrors) {
        setProfileErrors(fieldErrors);
        return;
      }
      Alert.alert('Something went wrong', extractErrorMessage(error, 'Could not save your changes. Please try again.'));
    },
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const passwordMutation = useMutation({
    mutationFn: () => updateProfile({ current_password: currentPassword, password: newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});
      Alert.alert('Password updated', 'Your password has been changed.');
    },
    onError: (error: any) => {
      // `current_password` is the field the backend rejects when the existing
      // password is wrong, which is by far the likeliest failure here.
      const fieldErrors = fieldErrorsFromResponse(error, ['current_password', 'password'] as const);
      if (fieldErrors) {
        setPasswordErrors(fieldErrors);
        return;
      }
      Alert.alert('Something went wrong', extractErrorMessage(error, 'Could not update your password. Please try again.'));
    },
  });

  const handleSaveProfile = () => {
    const next: Partial<Record<ProfileField, string>> = {};
    if (!name.trim()) next.name = 'Enter your name.';
    if (!email.trim()) {
      next.email = 'Enter your email address.';
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = 'That doesn’t look like an email address.';
    }

    setProfileErrors(next);
    if (Object.keys(next).length > 0) return;
    profileMutation.mutate();
  };

  const handleUpdatePassword = () => {
    const next: Partial<Record<PasswordField, string>> = {};
    if (!currentPassword) next.current_password = 'Enter your current password.';
    if (!newPassword) {
      next.password = 'Enter a new password.';
    } else if (newPassword.length < 8) {
      next.password = 'Use at least 8 characters.';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Confirm your new password.';
    } else if (newPassword && newPassword !== confirmPassword) {
      next.confirmPassword = 'This doesn’t match your new password.';
    }

    setPasswordErrors(next);
    if (Object.keys(next).length > 0) return;
    passwordMutation.mutate();
  };

  // Errors clear as soon as the offending field is edited, so a message never
  // outlives the problem it describes.
  const editProfileField =
    (field: ProfileField, setter: (value: string) => void) => (value: string) => {
      setter(value);
      if (profileErrors[field]) setProfileErrors((current) => ({ ...current, [field]: undefined }));
    };

  const editPasswordField =
    (field: PasswordField, setter: (value: string) => void) => (value: string) => {
      setter(value);
      if (passwordErrors[field]) {
        setPasswordErrors((current) => ({ ...current, [field]: undefined }));
      }
    };

  if (isLoading) {
    return <Spinner fullScreen />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sits above the email field it's about — changing the address
          re-triggers verification, so the two belong together. */}
      <VerifyEmailBanner />

      <Text style={styles.sectionTitle}>Profile</Text>

      <TextField
        label="Name"
        value={name}
        onChangeText={editProfileField('name', setName)}
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        returnKeyType="next"
        onSubmitEditing={() => emailInputRef.current?.focus()}
        submitBehavior="submit"
        editable={!profileMutation.isPending}
        error={profileErrors.name}
      />
      <TextField
        ref={emailInputRef}
        label="Email"
        value={email}
        onChangeText={editProfileField('email', setEmail)}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        returnKeyType="done"
        onSubmitEditing={handleSaveProfile}
        editable={!profileMutation.isPending}
        error={profileErrors.email}
      />

      <Button label="Save Changes" onPress={handleSaveProfile} loading={profileMutation.isPending} />

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Change Password</Text>

      <TextField
        label="Current Password"
        value={currentPassword}
        onChangeText={editPasswordField('current_password', setCurrentPassword)}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        returnKeyType="next"
        onSubmitEditing={() => newPasswordInputRef.current?.focus()}
        submitBehavior="submit"
        editable={!passwordMutation.isPending}
        error={passwordErrors.current_password}
      />
      <TextField
        ref={newPasswordInputRef}
        label="New Password"
        value={newPassword}
        onChangeText={editPasswordField('password', setNewPassword)}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="next"
        onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
        submitBehavior="submit"
        editable={!passwordMutation.isPending}
        error={passwordErrors.password}
        hint="At least 8 characters, with a number and mixed case."
      />
      <TextField
        ref={confirmPasswordInputRef}
        label="Confirm New Password"
        value={confirmPassword}
        onChangeText={editPasswordField('confirmPassword', setConfirmPassword)}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={handleUpdatePassword}
        editable={!passwordMutation.isPending}
        error={passwordErrors.confirmPassword}
      />

      <Button label="Update Password" onPress={handleUpdatePassword} loading={passwordMutation.isPending} />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, width: '100%', maxWidth: 520, alignSelf: 'center' },
    sectionTitle: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
    divider: { height: 1, backgroundColor: colors.borderMuted, marginVertical: 28 },
  });
