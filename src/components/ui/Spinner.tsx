import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/spacing';

interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  // Centers the indicator in the available space with the screen
  // background — a drop-in replacement for the `centered` + ActivityIndicator
  // block repeated across every screen's loading state.
  fullScreen?: boolean;
}

export function Spinner({ size = 'large', color, fullScreen = false }: SpinnerProps) {
  const { colors } = useTheme();
  const indicator = <ActivityIndicator size={size} color={color ?? colors.accent} />;

  if (!fullScreen) return indicator;

  return <View style={[styles.fullScreen, { backgroundColor: colors.background }]}>{indicator}</View>;
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
