<?php

namespace App\Services;

use App\Enums\NotificationType;
use App\Models\Plan;

/**
 * The user-facing copy for everything that happens to a plan.
 *
 * Kept out of GeneratePlanSteps so that job stays about generating steps,
 * and kept together so the five messages a plan can send read like they
 * came from the same app.
 *
 * Every method no-ops for an ownerless plan — featured plans are
 * admin-curated and have `user_id = null` by design.
 */
class PlanNotifier
{
    public function __construct(private PushNotificationService $push) {}

    public function planReady(Plan $plan): void
    {
        $this->send(
            $plan,
            NotificationType::PlanReady,
            ($plan->emoji ? $plan->emoji.' ' : '').$plan->title.' is ready',
            $this->stepSummary($plan),
            dedupeKey: 'plan:'.$plan->id,
        );
    }

    public function refinementApplied(Plan $plan): void
    {
        $this->send(
            $plan,
            NotificationType::RefinementApplied,
            ($plan->emoji ? $plan->emoji.' ' : '').$plan->title.' has been reworked',
            $this->stepSummary($plan),
            // Per refinement, not per plan: a plan can be refined more than
            // once, and each attempt is its own thing to report.
            dedupeKey: 'refinement:'.($plan->latestRefinement?->id ?? $plan->id),
        );
    }

    public function refinementFailed(Plan $plan): void
    {
        $this->send(
            $plan,
            NotificationType::RefinementFailed,
            "We couldn't rework {$plan->title}",
            'Your original plan is untouched. Tap to try again.',
            dedupeKey: 'refinement:'.($plan->latestRefinement?->id ?? $plan->id),
        );
    }

    public function planFailed(Plan $plan): void
    {
        $this->send(
            $plan,
            NotificationType::PlanFailed,
            "We couldn't build that plan",
            // True as of PlanController::retry(), which re-dispatches
            // without calling recordGeneration().
            "Tap to try again — it won't count against your generations.",
            dedupeKey: 'plan:'.$plan->id,
        );
    }

    public function planRejected(Plan $plan): void
    {
        $this->send(
            $plan,
            NotificationType::PlanRejected,
            "We can't build a plan for that goal",
            'Tap to see why, and try something else.',
            dedupeKey: 'plan:'.$plan->id,
        );
    }

    private function stepSummary(Plan $plan): string
    {
        $count = $plan->steps()->count();
        $first = $plan->steps()->orderBy('order')->value('title');

        $steps = $count === 1 ? '1 step' : "{$count} steps";

        return $first ? "{$steps}, starting with \"{$first}\"." : "{$steps} to work through.";
    }

    private function send(
        Plan $plan,
        NotificationType $type,
        string $title,
        string $body,
        ?string $dedupeKey = null,
    ): void {
        $user = $plan->user;

        if ($user === null) {
            return;
        }

        $this->push->send(
            $user,
            $type,
            $title,
            $body,
            data: ['type' => $type->value, 'planId' => $plan->id],
            dedupeKey: $dedupeKey,
        );
    }
}
