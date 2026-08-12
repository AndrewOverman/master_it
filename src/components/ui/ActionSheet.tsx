import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { useOnModalHidden } from './useOnModalHidden';

export interface SheetAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onDismiss: () => void;
}

/**
 * Bottom sheet of actions for a single item.
 *
 * Exists because row actions used to be reachable only by swiping, with no
 * affordance saying so — a user who never guessed the gesture had no way to
 * complete or reset a plan at all. The swipe stays as a shortcut; this is the
 * visible path to the same actions.
 *
 * Hand-rolled rather than ActionSheetIOS so Android gets the same thing, and
 * so it inherits the app's own surface/radius/color tokens.
 */
const ENTER_MS = 240;
const EXIT_MS = 180;

// Used for the first open only, before onLayout has measured the sheet. Just
// has to be taller than any real sheet so it starts fully offscreen.
const UNMEASURED_SHEET_HEIGHT = 600;

export function ActionSheet({ visible, title, actions, onDismiss }: ActionSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Modal's own animationType can't express this: it animates the whole
  // container, so "slide" drags the scrim up from the bottom edge along with
  // the sheet. Driving the two separately lets the scrim fade in where it
  // already sits while only the sheet travels.
  const progress = useRef(new Animated.Value(0)).current;
  const [sheetHeight, setSheetHeight] = useState(0);

  // The modal has to outlive `visible` long enough to play the exit animation,
  // so what's mounted is tracked separately from what's requested.
  const [mounted, setMounted] = useState(visible);

  // Actions don't run on press — they run once this sheet is off screen.
  //
  // An action that opens another modal (PlanDetail's "Refine plan") used to
  // do nothing at all: the sheet only *requests* its dismissal on the tick
  // the next modal asks to open, and iOS drops a modal presented while
  // another is still on screen. See useOnModalHidden for the full story.
  const pendingActionRef = useRef<(() => void) | null>(null);

  const runPendingAction = () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  };

  // `mounted`, not `visible` — the sheet outlives the close request by its
  // own exit animation, and the modal isn't going anywhere until then.
  const hiddenProps = useOnModalHidden(mounted, runPendingAction);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? ENTER_MS : EXIT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
      }
    });
    return () => animation.stop();
  }, [visible, progress]);

  const handleActionPress = (action: SheetAction) => {
    pendingActionRef.current = action.onPress;
    onDismiss();
  };

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight || UNMEASURED_SHEET_HEIGHT, 0],
  });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onDismiss} {...hiddenProps}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        {/* Claims its own touches so taps on the sheet's padding don't reach
            the scrim behind it — Android hands a declined touch to the next
            sibling underneath, iOS doesn't. */}
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.sm, transform: [{ translateY }] },
          ]}
          onStartShouldSetResponder={() => true}
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        >
          {title && (
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          )}

          {actions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.action}
              onPress={() => handleActionPress(action)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Ionicons
                name={action.icon}
                size={22}
                color={action.destructive ? colors.destructive : colors.textPrimary}
              />
              <Text style={[styles.actionLabel, action.destructive && styles.actionLabelDestructive]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.cancel} onPress={onDismiss} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    scrim: { backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.md,
    },
    title: {
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
    },
    actionLabel: { fontSize: typography.body.fontSize, fontWeight: '600', color: colors.textPrimary },
    actionLabelDestructive: { color: colors.destructive },
    cancel: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.borderMuted,
    },
    cancelLabel: { fontSize: typography.body.fontSize, fontWeight: '600', color: colors.textSecondary },
  });
