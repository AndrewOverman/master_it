import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const MARK_SIZE = 56;
const STROKE_WIDTH = 8.8;

// Same ascending-M stroke as assets/adaptive-icon.svg (path "M6,46 L20,16
// L28,30 L42,10 L50,46"), scaled 0.8x about the mark's center so the two
// bottom joints clear the badge's own corner radius instead of clipping it.
const JOINTS = [
  { x: 10.4, y: 42.4 },
  { x: 21.6, y: 18.4 },
  { x: 28, y: 29.6 },
  { x: 39.2, y: 13.6 },
  { x: 45.6, y: 42.4 },
];

const SEGMENTS = [
  { length: 26.48, angle: -64.98, midX: 16, midY: 30.4 },
  { length: 12.9, angle: 60.26, midX: 24.8, midY: 24 },
  { length: 19.53, angle: -55.01, midX: 33.6, midY: 21.6 },
  { length: 29.5, angle: 77.47, midX: 42.4, midY: 28 },
];

export function Logo() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        {SEGMENTS.map((segment, i) => (
          <View
            key={i}
            style={[
              styles.stroke,
              {
                width: segment.length,
                left: segment.midX - segment.length / 2,
                top: segment.midY - STROKE_WIDTH / 2,
                transform: [{ rotate: `${segment.angle}deg` }],
              },
            ]}
          />
        ))}
        {JOINTS.map((joint, i) => (
          <View
            key={i}
            style={[styles.joint, { left: joint.x - STROKE_WIDTH / 2, top: joint.y - STROKE_WIDTH / 2 }]}
          />
        ))}
      </View>
      <Text style={styles.wordmark}>Master It</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { alignItems: 'center' },
    mark: {
      width: MARK_SIZE,
      height: MARK_SIZE,
      borderRadius: radius.xl,
      backgroundColor: colors.accent,
    },
    stroke: {
      position: 'absolute',
      height: STROKE_WIDTH,
      borderRadius: STROKE_WIDTH / 2,
      backgroundColor: colors.background,
    },
    joint: {
      position: 'absolute',
      width: STROKE_WIDTH,
      height: STROKE_WIDTH,
      borderRadius: STROKE_WIDTH / 2,
      backgroundColor: colors.background,
    },
    wordmark: {
      marginTop: spacing.sm,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: colors.textPrimary,
    },
  });
