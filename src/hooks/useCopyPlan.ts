import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { copyPlan } from '../api/plans';
import type { Plan } from '../types/plan';
import { useRequireOnline } from '../lib/offline';

// Shared by the read-only preview screens (FeaturedPlan, SharedPlan) —
// confirm dialog, then clone into the user's own plans and jump straight to
// it. Adding a plan is only ever reachable through one of those previews, so
// the steps are always in view before the user commits.
//
// No allowance handling here: copying is unlimited on every tier, including
// free, because it never touches the LLM (see PlanController::copy).
export function useCopyPlan(navigation: any) {
  const queryClient = useQueryClient();
  const requireOnline = useRequireOnline();

  const copyMutation = useMutation({
    mutationFn: copyPlan,
    onSuccess: (newPlan) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      // Tab-qualified because this hook runs from both tabs: the Featured
      // feed lives under Explore, but the copy it just made is the user's
      // own plan, and those only exist in the Plans stack.
      navigation.navigate('Today', { screen: 'PlanDetail', params: { planId: newPlan.id } });
    },
    onError: (error: any) => {
      Alert.alert(
        'Something went wrong',
        error?.response?.data?.message ?? 'Could not add this plan. Please try again.'
      );
    },
  });

  const handleCopyPress = (plan: Plan) => {
    if (!requireOnline('add this plan')) return;
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
