import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, updateProfile } from '../api/auth';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, Spinner, TextField } from '../components/ui';

// Prefers the specific field validation message (e.g. "The email has
// already been taken.") over Laravel's generic top-level message.
function extractErrorMessage(error: any, fallback: string): string {
  const errors = error?.response?.data?.errors;
  const firstError = errors ? Object.values(errors)[0] : null;
  return (Array.isArray(firstError) ? firstError[0] : null) ?? error?.response?.data?.message ?? fallback;
}

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
      Alert.alert('Saved', 'Your profile has been updated.');
    },
    onError: (error: any) => {
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
      Alert.alert('Password updated', 'Your password has been changed.');
    },
    onError: (error: any) => {
      Alert.alert('Something went wrong', extractErrorMessage(error, 'Could not update your password. Please try again.'));
    },
  });

  const handleSaveProfile = () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing info', 'Name and email cannot be empty.');
      return;
    }
    profileMutation.mutate();
  };

  const handleUpdatePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing info', 'Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Password too short', 'Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords don't match", 'Double check your new password and confirmation.');
      return;
    }
    passwordMutation.mutate();
  };

  if (isLoading) {
    return <Spinner fullScreen />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Profile</Text>

      <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" editable={!profileMutation.isPending} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!profileMutation.isPending}
      />

      <Button label="Save Changes" onPress={handleSaveProfile} loading={profileMutation.isPending} />

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Change Password</Text>

      <TextField
        label="Current Password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        editable={!passwordMutation.isPending}
      />
      <TextField
        label="New Password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        editable={!passwordMutation.isPending}
      />
      <TextField
        label="Confirm New Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!passwordMutation.isPending}
      />

      <Button label="Update Password" onPress={handleUpdatePassword} loading={passwordMutation.isPending} />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, width: '100%', maxWidth: 520, alignSelf: 'center' },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },
    divider: { height: 1, backgroundColor: colors.borderMuted, marginVertical: 28 },
  });
