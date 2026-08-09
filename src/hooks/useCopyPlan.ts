import { useState } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { copyPlan } from '../api/plans';
import type { Plan } from '../types/plan';
import { useRequireOnline } from '../lib/offline';

// Shared by the read-only preview screens (FeaturedPlan, SharedPlan) —
// confirm dialog, then clone into the user's own plans and jump straight to
// it. The feed and Related Plans used to copy directly from a card; they now
// route through a preview, so adding always happens with the steps in view.
export function useCopyPlan(navigation: any) {
  const queryClient = useQueryClient();
  const requireOnline = useRequireOnline();
  const [limitModalMessage, setLimitModalMessage] = useState<string | null>(null);

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
      const message =
        error?.response?.data?.message ?? 'Could not add this plan. Please try again.';

      // 429 means the copy was rejected for being over max_plans, not a
      // failure — surface it as its own modal rather than a generic error.
      if (error?.response?.status === 429) {
        setLimitModalMessage(message);
        return;
      }

      Alert.alert('Something went wrong', message);
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

  return {
    copyMutation,
    handleCopyPress,
    limitModalVisible: limitModalMessage !== null,
    limitModalMessage: limitModalMessage ?? '',
    dismissLimitModal: () => setLimitModalMessage(null),
  };
}
