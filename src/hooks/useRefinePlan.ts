import { useState } from 'react';
import { Alert } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { refinePlan } from '../api/plans';
import type { RefinePlanRequest } from '../types/plan';

// Refinement is async like initial generation (not synchronous like
// copying), so success routes through the same Generating screen used by
// NewPlanScreen — .replace rather than .navigate since this hook is only
// ever invoked from PlanDetailScreen itself, keeping the stack at a single
// PlanDetail entry instead of stacking a second one on top.
export function useRefinePlan(navigation: any, planId: number) {
  const [limitModalMessage, setLimitModalMessage] = useState<string | null>(null);

  const refineMutation = useMutation({
    mutationFn: (payload: RefinePlanRequest) => refinePlan(planId, payload),
    onSuccess: (data) => {
      navigation.replace('Generating', { planId: data.id });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? 'Could not refine this plan. Please try again.';

      // 429 means the refinement was rejected for being over the
      // generation allowance, not a failure — surface it as its own modal
      // rather than a generic error, same convention as useCopyPlan.
      if (error?.response?.status === 429) {
        setLimitModalMessage(message);
        return;
      }

      Alert.alert('Something went wrong', message);
    },
  });

  return {
    refineMutation,
    limitModalVisible: limitModalMessage !== null,
    limitModalMessage: limitModalMessage ?? '',
    dismissLimitModal: () => setLimitModalMessage(null),
  };
}
