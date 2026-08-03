import React, { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';

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
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.button }]} onPress={onRetry}>
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
    // No crash-reporting service wired up yet — at minimum this keeps the
    // error visible in Metro/device logs instead of vanishing silently.
    console.error('Uncaught error in app tree:', error, info.componentStack);
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
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
