import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, updateProfile } from '../api/auth';

// Prefers the specific field validation message (e.g. "The email has
// already been taken.") over Laravel's generic top-level message.
function extractErrorMessage(error: any, fallback: string): string {
  const errors = error?.response?.data?.errors;
  const firstError = errors ? Object.values(errors)[0] : null;
  return (Array.isArray(firstError) ? firstError[0] : null) ?? error?.response?.data?.message ?? fallback;
}

export function AccountScreen() {
  const queryClient = useQueryClient();

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
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Profile</Text>

      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        editable={!profileMutation.isPending}
      />

      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!profileMutation.isPending}
      />

      <TouchableOpacity
        style={[styles.button, profileMutation.isPending && styles.buttonDisabled]}
        onPress={handleSaveProfile}
        disabled={profileMutation.isPending}
      >
        {profileMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Save Changes</Text>
        )}
      </TouchableOpacity>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Change Password</Text>

      <Text style={styles.fieldLabel}>Current Password</Text>
      <TextInput
        style={styles.input}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        editable={!passwordMutation.isPending}
      />

      <Text style={styles.fieldLabel}>New Password</Text>
      <TextInput
        style={styles.input}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        editable={!passwordMutation.isPending}
      />

      <Text style={styles.fieldLabel}>Confirm New Password</Text>
      <TextInput
        style={styles.input}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!passwordMutation.isPending}
      />

      <TouchableOpacity
        style={[styles.button, passwordMutation.isPending && styles.buttonDisabled]}
        onPress={handleUpdatePassword}
        disabled={passwordMutation.isPending}
      >
        {passwordMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Update Password</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, width: '100%', maxWidth: 520, alignSelf: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 28 },
});
