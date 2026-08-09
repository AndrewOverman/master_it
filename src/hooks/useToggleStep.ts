import * as Haptics from 'expo-haptics';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setStepComplete } from '../api/plans';
import type { Plan, PlanStep } from '../types/plan';

// Haptics are feedback, never a precondition — a device with no motor (or one
// that refuses the call) shouldn't turn checking off a step into an error.
function tapFeedback(style: Haptics.ImpactFeedbackStyle) {
  Haptics.impactAsync(style).catch(() => {});
}

function successFeedback() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

function applyStepCompletion(plan: Plan, stepId: number, completed: boolean): Plan {
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.id === stepId ? { ...step, completed_at: completed ? new Date().toISOString() : null } : step
    ),
  };
}

/**
 * Checking a step off, shared by the plan checklist and the Today screen's
 * per-plan cards — both need identical optimistic updates and the same
 * "that was the last one" celebration, and having two copies of that would
 * guarantee they drift.
 *
 * Completion is reported through `onPlanComplete` rather than held as state
 * in here, and the caller decides where to put the celebration. That matters
 * on Today: finishing a plan makes it inactive, so the card that owned the
 * toggle unmounts in the same render — state kept inside this hook would be
 * destroyed before the overlay could ever show. The owning *screen* has to
 * hold it. (It also keeps the moment on the screen the user was actually
 * using, rather than navigating them somewhere else to see it.)
 */
export function useToggleStep(planId: number, onPlanComplete?: (planId: number) => void) {
  const queryClient = useQueryClient();

  // Shared so onSettled can tell, via isMutating(), whether other toggles
  // for this plan are still in flight.
  const toggleMutationKey = ['plan', planId, 'toggle-step'];

  const toggleMutation = useMutation({
    mutationKey: toggleMutationKey,
    mutationFn: ({ stepId, completed }: { stepId: number; completed: boolean }) =>
      setStepComplete(planId, stepId, completed),
    // Optimistic so checking a step feels instant. Also patches the ['plans']
    // list cache — other screens showing this plan stay mounted, so without
    // this their counts stay stale until something else refetches.
    onMutate: async ({ stepId, completed }) => {
      // Fired here rather than in onSuccess so the tap lands with the
      // optimistic checkmark, not a round-trip later. Unchecking gets the
      // lighter tap — it's a correction, not an accomplishment.
      tapFeedback(
        completed ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Soft
      );

      await queryClient.cancelQueries({ queryKey: ['plan', planId] });
      const stepKey = ['plan', planId, 'step', stepId];
      const previousPlan = queryClient.getQueryData<Plan>(['plan', planId]);
      const previousPlans = queryClient.getQueryData<Plan[]>(['plans']);
      const previousStep = queryClient.getQueryData<PlanStep>(stepKey);

      queryClient.setQueryData<Plan>(['plan', planId], (old) =>
        old ? applyStepCompletion(old, stepId, completed) : old
      );
      queryClient.setQueryData<Plan[]>(['plans'], (old) =>
        old?.map((plan) => (plan.id === planId ? applyStepCompletion(plan, stepId, completed) : plan))
      );

      // The step detail screen reads its own ['plan', id, 'step', stepId]
      // entry, not the plan's copy of the step. Without patching it too, the
      // button there stays on "Mark as complete" until a refetch lands —
      // looking, for a second or two, like the tap did nothing.
      queryClient.setQueryData<PlanStep>(stepKey, (old) =>
        old ? { ...old, completed_at: completed ? new Date().toISOString() : null } : old
      );

      return { previousPlan, previousPlans, previousStep, stepKey };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousPlan) {
        queryClient.setQueryData(['plan', planId], context.previousPlan);
      }
      if (context?.previousPlans) {
        queryClient.setQueryData(['plans'], context.previousPlans);
      }
      if (context?.previousStep && context.stepKey) {
        queryClient.setQueryData(context.stepKey, context.previousStep);
      }
    },
    // Celebrate on every crossing into "every step done", not just the first
    // — steps stay editable after completion, so finishing again earns the
    // same moment. Only the latest review is kept (the feedback endpoint
    // upserts), so replaying it costs nothing.
    onSuccess: (updatedStep, { stepId, completed }) => {
      if (!completed) return;
      // Read from ['plans'] rather than ['plan', planId]: Today only ever
      // loads the list, and the per-plan cache may not exist there.
      const latestPlan =
        queryClient.getQueryData<Plan>(['plan', planId]) ??
        queryClient.getQueryData<Plan[]>(['plans'])?.find((plan) => plan.id === planId);
      if (!latestPlan) return;

      const stepsAfter = latestPlan.steps.map((step) =>
        step.id === stepId ? { ...step, completed_at: updatedStep.completed_at } : step
      );
      if (stepsAfter.length > 0 && stepsAfter.every((step) => step.completed_at)) {
        successFeedback();
        onPlanComplete?.(planId);
      }
    },
    onSettled: () => {
      // Checking off several steps in quick succession fires this mutation
      // concurrently — if every one refetches, an earlier toggle's response
      // can land after a later toggle's optimistic update and overwrite it
      // (the later step appears to "uncheck itself"). Only the last toggle
      // still in flight actually refetches.
      if (queryClient.isMutating({ mutationKey: toggleMutationKey }) === 0) {
        queryClient.invalidateQueries({ queryKey: ['plan', planId] });
        queryClient.invalidateQueries({ queryKey: ['plans'] });
      }
    },
  });

  return { toggleStep: toggleMutation.mutate };
}
