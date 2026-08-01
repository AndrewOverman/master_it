import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { copyPlan } from '../api/plans';
import type { Plan } from '../types/plan';

// Shared by any screen that shows copyable plan cards (Featured feed,
// Related Plans) — confirm dialog, then clone into the user's own
// plans and jump straight to it.
export function useCopyPlan(navigation: any) {
  const queryClient = useQueryClient();

  const copyMutation = useMutation({
    mutationFn: copyPlan,
    onSuccess: (newPlan) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      navigation.navigate('PlanDetail', { planId: newPlan.id });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ?? 'Could not add this plan. Please try again.';
      Alert.alert('Something went wrong', message);
    },
  });

  const handleCopyPress = (plan: Plan) => {
    Alert.alert(
      'Add to your plans?',
      `This adds "${plan.title}" to your plans so you can track it with checkboxes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add', onPress: () => copyMutation.mutate(plan.id) },
      ]
    );
  };

  return { copyMutation, handleCopyPress };
}
