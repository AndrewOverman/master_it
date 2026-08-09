import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPlan } from '../api/plans';
import { getCurrentUser } from '../api/auth';
import type { CreatePlanRequest } from '../types/plan';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { useRequireOnline } from '../lib/offline';
import { PlanLimitModal } from '../components/PlanLimitModal';
import { Button, TextField } from '../components/ui';
import { typography } from '../theme/typography';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

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

// Preselected so the default is something you can see and change, rather than
// a sentence under the chips explaining what happens if you pick nothing. 30
// days is what an unset target_days already resolved to server-side
// (GeneratePlanSteps::DEFAULT_TARGET_DAYS), so this only makes the existing
// behaviour visible — it doesn't change what gets generated.
const DEFAULT_DURATION_PRESET = '1 month';

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
  const [durationPreset, setDurationPreset] = useState<string | null>(DEFAULT_DURATION_PRESET);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const requireOnline = useRequireOnline();
  const promptInputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  // Shares the ['user'] cache with Account and Featured. Read here so the
  // allowance can be shown *before* the form is filled in — hitting the
  // limit only on submit means the user typed out a goal and picked three
  // options for nothing.
  const { data: user } = useQuery({ queryKey: ['user'], queryFn: getCurrentUser });
  const isOutOfGenerations = user?.can_generate === false;
  const generationsLeft = user?.generations_remaining;

  // `??` is what makes this correctly self-resolve all three states: no
  // preset picked (`undefined`, falls through to weeks/days — 0 if both are
  // blank), a fixed preset (its literal day count, even if weeks/days still
  // hold stale text from an earlier "Custom" selection), or "Custom"
  // (`days` is `null`, which `??` also treats as "fall through").
  const selectedDurationPreset = DURATION_PRESETS.find((preset) => preset.label === durationPreset);
  const targetDays = selectedDurationPreset?.days ?? (parseInt(weeks, 10) || 0) * 7 + (parseInt(days, 10) || 0);

  const handlePromptChange = (text: string) => {
    setPrompt(text);
    if (promptError) setPromptError(null);
  };

  const handleExamplePress = (example: string) => {
    setPrompt(example);
    setPromptError(null);
    promptInputRef.current?.focus();
  };

  const handleDurationPresetPress = (preset: (typeof DURATION_PRESETS)[number]) => {
    setDurationPreset(preset.label);
    setDurationError(null);
    if (preset.days !== null) {
      setWeeks('');
      setDays('');
    }
  };

  const handleDurationPartChange = (setter: (value: string) => void) => (text: string) => {
    setter(text.replace(/[^0-9]/g, ''));
    if (durationError) setDurationError(null);
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

      // 429 is the generation allowance, not a fault — same treatment the
      // copy and refine flows give it, rather than a generic "something went
      // wrong" that reads like a bug the user should retry.
      if (error?.response?.status === 429) {
        // The allowance clearly changed under us, so refresh what the form
        // is showing along with it.
        queryClient.invalidateQueries({ queryKey: ['user'] });
        setLimitMessage(message);
        return;
      }

      Alert.alert('Something went wrong', message);
    },
  });

  const handleSubmit = () => {
    // Printed under the offending field rather than raised as alerts, which
    // would cover the very field they're complaining about.
    const promptProblem =
      prompt.trim().length < 5 ? 'Describe what you want to learn in a sentence or two.' : null;
    const durationProblem = targetDays > 365 ? 'Plans can span up to 365 days.' : null;

    setPromptError(promptProblem);
    setDurationError(durationProblem);
    if (promptProblem) {
      promptInputRef.current?.focus();
      return;
    }
    if (durationProblem) return;

    if (!requireOnline('generate a new plan')) return;

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

      {isOutOfGenerations && (
        <View style={styles.limitNotice}>
          <View style={styles.limitNoticeHeader}>
            <Ionicons name="lock-closed-outline" size={17} color={colors.destructive} />
            <Text style={styles.limitNoticeText}>
              {user?.generation_limit_message ?? "You're out of plan generations."}
            </Text>
          </View>
          {/* The way out. Telling someone to subscribe without giving them
              somewhere to do it is a dead end. */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Paywall')}
            style={styles.limitNoticeAction}
            accessibilityRole="button"
            accessibilityLabel="See subscription plans"
          >
            <Text style={styles.limitNoticeActionText}>See plans</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.accent} />
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.exampleLabel}>Need an idea? Try one of these</Text>
      <View style={styles.exampleRow}>
        {EXAMPLE_PROMPTS.map((example) => (
          <TouchableOpacity
            key={example.label}
            style={styles.exampleChip}
            onPress={() => handleExamplePress(example.prompt)}
            disabled={mutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={`Use example: ${example.label}`}
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
        onChangeText={handlePromptChange}
        editable={!mutation.isPending}
        error={promptError}
      />

      {/* Each of these rows is a one-of-many choice, so the chips are radios
          rather than buttons — that's what makes VoiceOver announce both the
          group and which option is currently selected. */}
      <Text style={styles.sectionLabel}>Current level</Text>
      <View style={styles.optionRow} accessibilityRole="radiogroup" accessibilityLabel="Current level">
        {SKILL_LEVELS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionChip,
              skillLevel === option.value && styles.optionChipSelected,
            ]}
            onPress={() => setSkillLevel(option.value)}
            disabled={mutation.isPending}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: skillLevel === option.value, disabled: mutation.isPending }}
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
      <View
        style={styles.optionRow}
        accessibilityRole="radiogroup"
        accessibilityLabel="Time you can commit"
      >
        {TIME_COMMITMENTS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionChip,
              timeCommitment === option.value && styles.optionChipSelected,
            ]}
            onPress={() => setTimeCommitment(option.value)}
            disabled={mutation.isPending}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{
              selected: timeCommitment === option.value,
              disabled: mutation.isPending,
            }}
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
      <View style={styles.optionRow} accessibilityRole="radiogroup" accessibilityLabel="Plan duration">
        {DURATION_PRESETS.map((preset) => (
          <TouchableOpacity
            key={preset.label}
            style={[styles.optionChip, durationPreset === preset.label && styles.optionChipSelected]}
            onPress={() => handleDurationPresetPress(preset)}
            disabled={mutation.isPending}
            accessibilityRole="radio"
            accessibilityLabel={preset.label}
            accessibilityState={{
              selected: durationPreset === preset.label,
              disabled: mutation.isPending,
            }}
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
              onChangeText={handleDurationPartChange(setWeeks)}
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
              onChangeText={handleDurationPartChange(setDays)}
              keyboardType="number-pad"
              maxLength={2}
              editable={!mutation.isPending}
            />
            <Text style={styles.durationUnit}>days</Text>
          </View>
        </View>
      )}
      {durationError ? (
        <Text style={styles.durationError} accessibilityRole="alert">
          {durationError}
        </Text>
      ) : targetDays === 0 ? (
        <Text style={styles.durationHint}>Leave blank for a default ~30-day plan.</Text>
      ) : null}

      <Button
        label="Build my plan"
        onPress={handleSubmit}
        loading={mutation.isPending}
        disabled={isOutOfGenerations}
        style={styles.submitButton}
      />
      {!isOutOfGenerations && generationsLeft !== undefined && generationsLeft > 0 && (
        <Text style={styles.allowanceHint}>
          {generationsLeft} plan generation{generationsLeft === 1 ? '' : 's'} left
        </Text>
      )}

      <PlanLimitModal
        visible={limitMessage !== null}
        title="Out of plan generations"
        message={limitMessage ?? ''}
        onUpgrade={() => {
          // Dismissed first: leaving it mounted would stack the paywall
          // modal on top of this one, and dismissing the paywall would
          // reveal the limit modal again behind it.
          setLimitMessage(null);
          navigation.navigate('Paywall');
        }}
        onDismiss={() => setLimitMessage(null)}
      />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingTop: spacing.xxxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
    heading: { fontSize: typography.h1.fontSize, fontWeight: '700', color: colors.textPrimary },
    subheading: { fontSize: typography.bodyMedium.fontSize, color: colors.textMuted, marginTop: 6, marginBottom: spacing.xl },
    exampleLabel: { fontSize: typography.caption.fontSize, fontWeight: '600', color: colors.textSecondary, marginBottom: 10 },
    exampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
    // minHeight rather than more paddingVertical: 44pt is the documented
    // minimum target on both platforms, and centring the label inside a
    // fixed-floor box hits it without the chips growing when the text wraps.
    exampleChip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingVertical: 7,
      paddingHorizontal: 13,
      borderRadius: radius.pill,
      backgroundColor: colors.accentMuted,
    },
    exampleChipText: { fontSize: typography.caption.fontSize, color: colors.accent, fontWeight: '600' },
    promptField: { marginBottom: spacing.xl },
    sectionLabel: { fontSize: typography.label.fontSize, fontWeight: '600', color: colors.textSecondary, marginBottom: 10 },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xl },
    optionChip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingVertical: spacing.xs,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    optionChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    optionChipText: { fontSize: typography.label.fontSize, color: colors.textSecondary },
    optionChipTextSelected: { color: colors.background, fontWeight: '600' },
    durationRow: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
    durationField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    durationInput: {
      width: 64,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    durationUnit: { fontSize: typography.label.fontSize, color: colors.textSecondary },
    durationHint: { fontSize: typography.small.fontSize, color: colors.textPlaceholder, marginTop: spacing.xs, marginBottom: spacing.xl },
    durationError: { fontSize: typography.caption.fontSize, color: colors.destructive, marginTop: spacing.xs, marginBottom: spacing.xl },
    submitButton: { marginTop: spacing.xs },
    allowanceHint: {
      fontSize: typography.small.fontSize,
      color: colors.textPlaceholder,
      textAlign: 'center',
      marginTop: 10,
    },
    limitNotice: {
      // Column now that it carries an action beneath the message; the icon
      // and text keep their own row.
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      marginBottom: spacing.xl,
    },
    limitNoticeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    limitNoticeText: { flex: 1, fontSize: typography.caption.fontSize, lineHeight: typography.caption.lineHeight, color: colors.textSecondary },
    limitNoticeAction: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      // Keeps the 44pt floor without the notice growing when the message
      // above it wraps — same approach as the option chips.
      minHeight: 44,
      paddingHorizontal: spacing.xxs,
    },
    limitNoticeActionText: { fontSize: typography.label.fontSize, fontWeight: '600', color: colors.accent },
  });
