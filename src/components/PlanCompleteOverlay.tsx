import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { shadows } from '../theme/shadows';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONFETTI_COLORS = ['#FDE68A', '#FCA5A5', '#93C5FD', '#6EE7B7', '#C4B5FD', '#FDBA74', '#F472B6'];
const CONFETTI_COUNT = 40;
const AUTO_DISMISS_MS = 10000;

interface ConfettiPieceConfig {
  left: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  rotationDirection: number;
}

function ConfettiPiece({ config }: { config: ConfettiPieceConfig }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: config.duration,
      delay: config.delay,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, SCREEN_HEIGHT + 40],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, config.rotationDirection * 24, 0],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${config.rotationDirection * 360}deg`],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        staticStyles.confettiPiece,
        {
          left: config.left,
          width: config.size,
          height: config.size * 0.4,
          backgroundColor: config.color,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    />
  );
}

interface PlanCompleteOverlayProps {
  visible: boolean;
  onDismiss: () => void;
  message?: string;
}

export function PlanCompleteOverlay({ visible, onDismiss, message }: PlanCompleteOverlayProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDismiss = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  useEffect(() => {
    if (!visible) return;

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();

    dismissTimer.current = setTimeout(handleDismiss, AUTO_DISMISS_MS);

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const confettiPieces = useMemo<ConfettiPieceConfig[]>(() => {
    if (!visible) return [];
    return Array.from({ length: CONFETTI_COUNT }, () => ({
      left: Math.random() * SCREEN_WIDTH,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 16 + Math.random() * 16,
      delay: Math.random() * 400,
      duration: 2600 + Math.random() * 1400,
      rotationDirection: Math.random() > 0.5 ? 1 : -1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
      {confettiPieces.map((config, index) => (
        <ConfettiPiece key={index} config={config} />
      ))}

      <View style={styles.card}>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>Congratulations!</Text>
        <Text style={styles.message}>
          {message ??
            "Keep up the momentum and setup a new plan to accomplish your goals! You can do whatever you set your mind to with Master It!"}
        </Text>
      </View>
    </Animated.View>
  );
}

const staticStyles = StyleSheet.create({
  confettiPiece: {
    position: 'absolute',
    top: 0,
    borderRadius: 2,
  },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    card: {
      width: '84%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingVertical: 32,
      paddingHorizontal: 24,
      alignItems: 'center',
      ...shadows.card,
    },
    dismissButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      padding: 4,
    },
    emoji: { fontSize: 40, marginBottom: 8 },
    title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
    message: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  });
