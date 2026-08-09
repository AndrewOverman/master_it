import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { REFINEMENT_TAG_LABELS, RefinementTag } from '../types/plan';
import { Button, TextField } from './ui';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

const NOTES_MAX_LENGTH = 280;

const TAG_OPTIONS = Object.keys(REFINEMENT_TAG_LABELS) as RefinementTag[];

interface RefinePlanModalProps {
  visible: boolean;
  isSubmitting: boolean;
  // How many steps are currently checked off. Refining replaces the plan's
  // steps wholesale (GeneratePlanSteps deletes them before writing the new
  // set), so this is what the user stands to lose — worth naming before they
  // commit, not after.
  completedSteps: number;
  onSubmit: (input: { tags: RefinementTag[]; notes: string }) => void;
  onDismiss: () => void;
}

// Tag chips mirror NewPlanScreen's option-chip pattern; the modal shell
// (backdrop/card) mirrors PlanLimitModal's.
export function RefinePlanModal({
  visible,
  isSubmitting,
  completedSteps,
  onSubmit,
  onDismiss,
}: RefinePlanModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedTags, setSelectedTags] = useState<RefinementTag[]>([]);
  const [notes, setNotes] = useState('');

  const toggleTag = (tag: RefinementTag) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  };

  // Mirrors the backend's own requirement (PlanController::refine() 422s
  // if both are empty) so the button's disabled state never lies about
  // what a tap would do.
  const canSubmit = (selectedTags.length > 0 || notes.trim().length > 0) && !isSubmitting;

  const reset = () => {
    setSelectedTags([]);
    setNotes('');
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ tags: selectedTags, notes: notes.trim() });
    reset();
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Refine this plan</Text>
          <Text style={styles.subtitle}>Tell us what to change and we'll revise your steps.</Text>

          <View style={styles.notice}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.destructive} />
            <Text style={styles.noticeText}>
              {completedSteps > 0
                ? `This rewrites every step, so your progress resets — the ${completedSteps} step${
                    completedSteps === 1 ? '' : 's'
                  } you've checked off ${completedSteps === 1 ? 'will be' : 'will all be'} unchecked.`
                : 'This rewrites every step in the plan, so any progress you have resets.'}
            </Text>
          </View>

          <View style={styles.chipRow}>
            {TAG_OPTIONS.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleTag(tag)}
                  disabled={isSubmitting}
                  // Checkbox, not radio: any number of these can be on at once.
                  accessibilityRole="checkbox"
                  accessibilityLabel={REFINEMENT_TAG_LABELS[tag]}
                  accessibilityState={{ checked: selected, disabled: isSubmitting }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {REFINEMENT_TAG_LABELS[tag]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextField
            containerStyle={styles.notesFieldContainer}
            style={styles.notesField}
            placeholder="Anything else? (optional)"
            multiline
            value={notes}
            onChangeText={(text) => setNotes(text.slice(0, NOTES_MAX_LENGTH))}
            editable={!isSubmitting}
            maxLength={NOTES_MAX_LENGTH}
          />
          <Text style={styles.charCount}>
            {notes.length}/{NOTES_MAX_LENGTH}
          </Text>

          <View style={styles.actionRow}>
            <Button label="Cancel" variant="secondary" onPress={handleDismiss} disabled={isSubmitting} style={styles.actionButton} />
            <Button
              label={isSubmitting ? 'Refining…' : 'Refine'}
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.xl,
      ...shadows.card,
    },
    title: { fontSize: typography.h3.fontSize, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
    subtitle: { fontSize: typography.label.fontSize, color: colors.textSecondary, marginBottom: 14 },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      marginBottom: 18,
    },
    noticeText: { flex: 1, fontSize: typography.caption.fontSize, lineHeight: typography.caption.lineHeight, color: colors.textSecondary },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
    chip: {
      // 44pt floor, same as NewPlanScreen's option chips.
      minHeight: 44,
      justifyContent: 'center',
      paddingVertical: spacing.xs,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontSize: typography.label.fontSize, color: colors.textSecondary },
    chipTextSelected: { color: colors.background, fontWeight: '600' },
    notesFieldContainer: { marginBottom: 0 },
    notesField: { minHeight: 70 },
    charCount: { fontSize: typography.small.fontSize, color: colors.textPlaceholder, textAlign: 'right', marginTop: spacing.xxs, marginBottom: spacing.xs },
    actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    actionButton: { flex: 1 },
  });
