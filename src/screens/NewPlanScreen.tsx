import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { createPlan } from '../api/plans';
import type { CreatePlanRequest } from '../types/plan';

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

export function NewPlanScreen({ navigation }: any) {
  const [prompt, setPrompt] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('beginner');
  const [timeCommitment, setTimeCommitment] = useState<TimeCommitment>('moderate');
  const [weeks, setWeeks] = useState('');
  const [days, setDays] = useState('');

  const mutation = useMutation({
    mutationFn: createPlan,
    onSuccess: (data) => {
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

    const targetDays = (parseInt(weeks, 10) || 0) * 7 + (parseInt(days, 10) || 0);
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

      <TextInput
        style={styles.promptInput}
        placeholder="e.g. I want to learn to play basic chords on guitar"
        placeholderTextColor="#9CA3AF"
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

      <Text style={styles.sectionLabel}>How long should this plan take?</Text>
      <View style={styles.durationRow}>
        <View style={styles.durationField}>
          <TextInput
            style={styles.durationInput}
            placeholder="0"
            placeholderTextColor="#9CA3AF"
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
            placeholderTextColor="#9CA3AF"
            value={days}
            onChangeText={(text) => setDays(text.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
            editable={!mutation.isPending}
          />
          <Text style={styles.durationUnit}>days</Text>
        </View>
      </View>
      <Text style={styles.durationHint}>Leave blank for a default ~30-day plan.</Text>

      <TouchableOpacity
        style={[styles.submitButton, mutation.isPending && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Build my plan</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 40 },
  heading: { fontSize: 26, fontWeight: '700', color: '#111827' },
  subheading: { fontSize: 15, color: '#6B7280', marginTop: 6, marginBottom: 24 },
  promptInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    textAlignVertical: 'top',
    marginBottom: 24,
  },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  optionChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  optionChipSelected: { backgroundColor: '#111827', borderColor: '#111827' },
  optionChipText: { fontSize: 14, color: '#374151' },
  optionChipTextSelected: { color: '#fff', fontWeight: '600' },
  durationRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  durationField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  durationInput: {
    width: 64,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
  },
  durationUnit: { fontSize: 14, color: '#374151' },
  durationHint: { fontSize: 12, color: '#9CA3AF', marginTop: 8, marginBottom: 24 },
  submitButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
