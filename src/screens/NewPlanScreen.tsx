import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPlan } from '../api/plans';
import type { CreatePlanRequest } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useRequireOnline } from '../lib/offline';
import { Button, TextField } from '../components/ui';

type SkillLevel = CreatePlanRequest['skill_level'];
type TimeCommitment = CreatePlanRequest['time_commitment'];

const SKILL_LEVELS: { label: string; value: SkillLevel }[] = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Some experience', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
];

const TIME_COMMITMENTS: { label: string; value: TimeCommitment }[] = [
  { label: '~15 min/day', value: 'light' },
  { label: '~1 hr/day', value: 'moderate' },
  { label: 'Several hrs/day', value: 'intensive' },
];

// `days: null` marks "Custom" — selecting it reveals the raw weeks/days
// fields below instead of setting a fixed length.
const DURATION_PRESETS: { label: string; days: number | null }[] = [
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: 'Custom', days: null },
];

// Short label for the chip vs. the fuller sentence it fills in — keeps the
// row scannable while still handing the model a well-formed prompt.
const EXAMPLE_PROMPTS: { label: string; prompt: string }[] = [
  { label: 'Learn guitar chords', prompt: 'I want to learn to play basic chords on guitar' },
  { label: 'Train for a 5K', prompt: 'I want to train for a 5K race' },
  { label: 'Learn conversational Spanish', prompt: 'I want to learn conversational Spanish' },
  { label: 'Pass the CPA exam', prompt: 'I want to study for and pass the CPA exam' },
  { label: 'Get better at public speaking', prompt: 'I want to get better at public speaking' },
  { label: 'Learn to cook Italian food', prompt: 'I want to learn to cook classic Italian dishes' },
];

export function NewPlanScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [prompt, setPrompt] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('beginner');
  const [timeCommitment, setTimeCommitment] = useState<TimeCommitment>('moderate');
  const [weeks, setWeeks] = useState('');
  const [days, setDays] = useState('');
  const [durationPreset, setDurationPreset] = useState<string | null>(null);
  const requireOnline = useRequireOnline();
  const promptInputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();

  // `??` is what makes this correctly self-resolve all three states: no
  // preset picked (`undefined`, falls through to weeks/days — 0 if both are
  // blank), a fixed preset (its literal day count, even if weeks/days still
  // hold stale text from an earlier "Custom" selection), or "Custom"
  // (`days` is `null`, which `??` also treats as "fall through").
  const selectedDurationPreset = DURATION_PRESETS.find((preset) => preset.label === durationPreset);
  const targetDays = selectedDurationPreset?.days ?? (parseInt(weeks, 10) || 0) * 7 + (parseInt(days, 10) || 0);

  const handleExamplePress = (example: string) => {
    setPrompt(example);
    promptInputRef.current?.focus();
  };

  const handleDurationPresetPress = (preset: (typeof DURATION_PRESETS)[number]) => {
    setDurationPreset(preset.label);
    if (preset.days !== null) {
      setWeeks('');
      setDays('');
    }
  };

  const mutation = useMutation({
    mutationFn: createPlan,
    onSuccess: (data) => {
      // Refreshes the shared ['plans'] cache so Featured's first-time hero
      // clears immediately rather than on next pull-to-refresh.
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      // Navigate to the generating screen with the new plan's id
      navigation.navigate('Generating', { planId: data.id });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ?? 'Could not start generating your plan. Please try again.';
      Alert.alert('Something went wrong', message);
    },
  });

  const handleSubmit = () => {
    if (prompt.trim().length < 5) {
      Alert.alert('Tell us a bit more', 'Describe what you want to learn in a sentence or two.');
      return;
    }

    if (!requireOnline('generate a new plan')) return;

    if (targetDays > 365) {
      Alert.alert('That\'s a long plan', 'Plans can span up to 365 days.');
      return;
    }

    mutation.mutate({
      prompt: prompt.trim(),
      skill_level: skillLevel,
      time_commitment: timeCommitment,
      ...(targetDays > 0 ? { target_days: targetDays } : {}),
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>What do you want to learn?</Text>
      <Text style={styles.subheading}>
        Describe a skill or goal. We'll build you a step-by-step plan.
      </Text>

      <Text style={styles.exampleLabel}>Need an idea? Try one of these</Text>
      <View style={styles.exampleRow}>
        {EXAMPLE_PROMPTS.map((example) => (
          <TouchableOpacity
            key={example.label}
            style={styles.exampleChip}
            onPress={() => handleExamplePress(example.prompt)}
            disabled={mutation.isPending}
          >
            <Text style={styles.exampleChipText}>{example.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextField
        ref={promptInputRef}
        containerStyle={styles.promptField}
        placeholder="e.g. I want to learn to play basic chords on guitar"
        multiline
        value={prompt}
        onChangeText={setPrompt}
        editable={!mutation.isPending}
      />

      <Text style={styles.sectionLabel}>Current level</Text>
      <View style={styles.optionRow}>
        {SKILL_LEVELS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionChip,
              skillLevel === option.value && styles.optionChipSelected,
            ]}
            onPress={() => setSkillLevel(option.value)}
            disabled={mutation.isPending}
          >
            <Text
              style={[
                styles.optionChipText,
                skillLevel === option.value && styles.optionChipTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Time you can commit</Text>
      <View style={styles.optionRow}>
        {TIME_COMMITMENTS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionChip,
              timeCommitment === option.value && styles.optionChipSelected,
            ]}
            onPress={() => setTimeCommitment(option.value)}
            disabled={mutation.isPending}
          >
            <Text
              style={[
                styles.optionChipText,
                timeCommitment === option.value && styles.optionChipTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Plan Duration</Text>
      <View style={styles.optionRow}>
        {DURATION_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.label}
            style={[styles.optionChip, durationPreset === preset.label && styles.optionChipSelected]}
            onPress={() => handleDurationPresetPress(preset)}
            disabled={mutation.isPending}
          >
            <Text
              style={[
                styles.optionChipText,
                durationPreset === preset.label && styles.optionChipTextSelected,
              ]}
            >
              {preset.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {durationPreset === 'Custom' && (
        <View style={styles.durationRow}>
          <View style={styles.durationField}>
            <TextInput
              style={styles.durationInput}
              placeholder="0"
              placeholderTextColor={colors.textPlaceholder}
              value={weeks}
              onChangeText={(text) => setWeeks(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
              editable={!mutation.isPending}
            />
            <Text style={styles.durationUnit}>weeks</Text>
          </View>
          <View style={styles.durationField}>
            <TextInput
              style={styles.durationInput}
              placeholder="0"
              placeholderTextColor={colors.textPlaceholder}
              value={days}
              onChangeText={(text) => setDays(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
              editable={!mutation.isPending}
            />
            <Text style={styles.durationUnit}>days</Text>
          </View>
        </View>
      )}
      {targetDays === 0 && (
        <Text style={styles.durationHint}>Leave blank for a default ~30-day plan.</Text>
      )}

      <Button label="Build my plan" onPress={handleSubmit} loading={mutation.isPending} style={styles.submitButton} />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingTop: 40, width: '100%', maxWidth: 520, alignSelf: 'center' },
    heading: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
    subheading: { fontSize: 15, color: colors.textMuted, marginTop: 6, marginBottom: 24 },
    exampleLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 10 },
    exampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    exampleChip: {
      paddingVertical: 7,
      paddingHorizontal: 13,
      borderRadius: 20,
      backgroundColor: colors.accentMuted,
    },
    exampleChipText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
    promptField: { marginBottom: 24 },
    sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 10 },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
    optionChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    optionChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    optionChipText: { fontSize: 14, color: colors.textSecondary },
    optionChipTextSelected: { color: colors.background, fontWeight: '600' },
    durationRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
    durationField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    durationInput: {
      width: 64,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 16,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    durationUnit: { fontSize: 14, color: colors.textSecondary },
    durationHint: { fontSize: 12, color: colors.textPlaceholder, marginTop: 8, marginBottom: 24 },
    submitButton: { marginTop: 8 },
  });
