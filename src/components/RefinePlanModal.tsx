import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { REFINEMENT_TAG_LABELS, RefinementTag } from '../types/plan';
import { Button, TextField } from './ui';
import { shadows } from '../theme/shadows';

const NOTES_MAX_LENGTH = 280;

const TAG_OPTIONS = Object.keys(REFINEMENT_TAG_LABELS) as RefinementTag[];

interface RefinePlanModalProps {
  visible: boolean;
  isSubmitting: boolean;
  onSubmit: (input: { tags: RefinementTag[]; notes: string }) => void;
  onDismiss: () => void;
}

// Tag chips mirror NewPlanScreen's option-chip pattern; the modal shell
// (backdrop/card) mirrors PlanLimitModal's.
export function RefinePlanModal({ visible, isSubmitting, onSubmit, onDismiss }: RefinePlanModalProps) {
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

          <View style={styles.chipRow}>
            {TAG_OPTIONS.map((tag) => {
              const selected = selectedTags.includes(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleTag(tag)}
                  disabled={isSubmitting}
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
      padding: 24,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingVertical: 24,
      paddingHorizontal: 24,
      ...shadows.card,
    },
    title: { fontSize: 19, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 18 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontSize: 14, color: colors.textSecondary },
    chipTextSelected: { color: colors.background, fontWeight: '600' },
    notesFieldContainer: { marginBottom: 0 },
    notesField: { minHeight: 70 },
    charCount: { fontSize: 11, color: colors.textPlaceholder, textAlign: 'right', marginTop: 4, marginBottom: 8 },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
    actionButton: { flex: 1 },
  });
