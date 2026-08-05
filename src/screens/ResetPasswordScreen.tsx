import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { resetPassword } from '../api/auth';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { Button, TextField, Logo } from '../components/ui';
import { getApiErrorMessage } from '../utils/apiError';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export function ResetPasswordScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token, email } = route.params;
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => resetPassword({ email, token, password }),
    onSuccess: () => {
      Alert.alert('Password updated', 'Please log back in with your new password.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    },
    onError: (error) => {
      Alert.alert('Something went wrong', getApiErrorMessage(error, 'Could not reset your password. Please try again.'));
    },
  });

  const handleSubmit = () => {
    if (!password.trim()) {
      Alert.alert('Missing info', 'Please enter a new password.');
      return;
    }
    mutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.avoider} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.brandHeader}>
            <Logo />
          </View>
          <Text style={styles.heading}>Set a new password</Text>
          <Text style={styles.subheading}>Choose a new password for {email}.</Text>

          <TextField
            placeholder="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!mutation.isPending}
          />

          <Button label="Update password" onPress={handleSubmit} loading={mutation.isPending} />
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
  });
