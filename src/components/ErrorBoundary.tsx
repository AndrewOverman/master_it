import React, { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';
import { reportError } from '../lib/errorReporting';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Uses RN's own useColorScheme rather than our ThemeContext so the fallback
// still renders correctly even if the crash happened above ThemeProvider.
function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark
    ? { background: '#0B0F17', text: '#F9FAFB', muted: '#9CA3AF', button: '#F9FAFB', buttonText: '#0B0F17' }
    : { background: '#FFFFFF', text: '#111827', muted: '#6B7280', button: '#111827', buttonText: '#FFFFFF' };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        The app hit an unexpected error. Try again, or restart the app if it keeps happening.
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.button }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={[styles.buttonText, { color: colors.buttonText }]}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // This boundary is the last thing between an error and a blank screen, so
    // anything reaching it has already cost the user their session — it's the
    // highest-signal report the app can send. reportError falls back to the
    // console when Sentry isn't configured, which is what dev and staging get.
    reportError(error, { componentStack: info.componentStack });
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: typography.h2.fontSize,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.bodyMedium.fontSize,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: {
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
});
