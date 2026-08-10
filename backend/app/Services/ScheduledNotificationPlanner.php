<?php

namespace App\Services;

use App\Enums\NotificationType;
use App\Models\Plan;
use App\Models\PlanStep;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Decides what — if anything — a user should hear about this morning.
 *
 * Every scheduled notification is evaluated here in one pass rather than
 * by a command per type, because that's what makes the one-a-day budget
 * meaningful: separate commands would each independently decide they were
 * the day's message, and the first to run would win by accident. Gathering
 * every candidate first lets the most useful one lead and a second ride
 * along as a clause.
 *
 * Nothing here sends. It returns candidates; PushNotificationService still
 * has the final word on preferences, quiet hours, dedup, and the budget.
 */
class ScheduledNotificationPlanner
{
    /**
     * Streak lengths worth interrupting someone over. Sparse on purpose —
     * a milestone every day is not a milestone.
     */
    private const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365];

    /**
     * How close to expiry a subscription has to be before it's news.
     */
    private const EXPIRY_WARNING_DAYS = 3;

    /**
     * Everything true about this user right now that's worth saying, best
     * first.
     *
     * @return array<int, array{type: NotificationType, title: string, body: string, clause: string, data: array<string, mixed>, dedupeKey: ?string, categoryId: ?string}>
     */
    public function candidatesFor(User $user, Carbon $localNow): array
    {
        $activePlans = $user->plans()
            ->with('steps')
            ->where('status', 'ready')
            ->whereNull('completed_at')
            ->get();

        $candidates = array_merge(
            $this->stepReminders($activePlans, $localNow),
            $this->planMilestones($activePlans),
            $this->streaks($user, $localNow),
            $this->weeklyRecap($user, $localNow),
            $this->accountNotices($user, $localNow),
        );

        usort($candidates, fn ($a, $b) => $a['type']->priority() <=> $b['type']->priority());

        return $candidates;
    }

    /**
     * The core nudge: steps the user said they'd finish, that they haven't.
     *
     * Due-today and overdue are one candidate rather than two competing
     * ones — they're the same thought, and someone with both would
     * otherwise hear about only half of what's waiting.
     *
     * @param  Collection<int, Plan>  $plans
     * @return array<int, array<string, mixed>>
     */
    private function stepReminders(Collection $plans, Carbon $localNow): array
    {
        $today = $localNow->toDateString();

        $pending = $plans
            ->flatMap(fn ($plan) => $plan->steps->map(fn ($step) => ['plan' => $plan, 'step' => $step]))
            ->filter(fn ($entry) => $entry['step']->completed_at === null && $entry['step']->due_date !== null);

        $dueToday = $pending->filter(fn ($entry) => $entry['step']->due_date->toDateString() === $today)->values();
        $overdue = $pending->filter(fn ($entry) => $entry['step']->due_date->toDateString() < $today)->values();

        if ($dueToday->isEmpty() && $overdue->isEmpty()) {
            return [];
        }

        // Action buttons only make sense when there's exactly one step to
        // act on — "Mark done" against four steps has no meaning.
        $single = $dueToday->count() === 1 && $overdue->isEmpty() ? $dueToday->first() : null;

        if ($dueToday->isNotEmpty()) {
            $count = $dueToday->count();
            $title = $count === 1
                ? 'One step to tackle today'
                : "{$count} steps to tackle today";

            $body = $single
                ? $single['step']->title
                : ($overdue->isNotEmpty()
                    ? $this->overdueClause($overdue->count())
                    : 'Open Master It to check them off.');

            return [[
                'type' => NotificationType::StepsDueToday,
                'title' => $title,
                'body' => $body,
                'clause' => $count === 1 ? 'One step is due today.' : "{$count} steps are due today.",
                'data' => $single
                    ? ['screen' => 'StepDetail', 'planId' => $single['plan']->id, 'stepId' => $single['step']->id]
                    : ['screen' => 'Today'],
                'dedupeKey' => 'day:'.$today,
                'categoryId' => $single ? 'step_reminder' : null,
            ]];
        }

        $count = $overdue->count();

        return [[
            'type' => NotificationType::StepsOverdue,
            'title' => $count === 1 ? 'One step is past due' : "{$count} steps are past due",
            // Deliberately not scolding. Someone who has fallen behind
            // already knows; the useful thing is an easy way back in.
            'body' => 'Pick one back up whenever you\'re ready.',
            'clause' => $this->overdueClause($count),
            'data' => ['screen' => 'Today'],
            'dedupeKey' => 'day:'.$today,
            'categoryId' => null,
        ]];
    }

    private function overdueClause(int $count): string
    {
        return $count === 1 ? 'One more is past due.' : "{$count} more are past due.";
    }

    /**
     * Progress worth pointing out, once per plan ever.
     *
     * @param  Collection<int, Plan>  $plans
     * @return array<int, array<string, mixed>>
     */
    private function planMilestones(Collection $plans): array
    {
        $candidates = [];

        foreach ($plans as $plan) {
            $total = $plan->steps->count();

            if ($total === 0) {
                continue;
            }

            $done = $plan->steps->whereNotNull('completed_at')->count();
            $remaining = $total - $done;

            // Every step is checked off, but the plan itself hasn't been
            // marked complete — the user is being celebrated in-app rather
            // than here. Without this, such a plan reads as 100% >= 50%
            // and would announce itself "halfway done".
            if ($remaining === 0) {
                continue;
            }

            if ($remaining === 1) {
                $lastStep = $plan->steps->firstWhere('completed_at', null);

                $candidates[] = [
                    'type' => NotificationType::OneStepLeft,
                    'title' => 'One step left in '.$plan->title,
                    'body' => $lastStep?->title ?? 'Finish it whenever you\'re ready.',
                    'clause' => $plan->title.' has one step left.',
                    'data' => array_filter([
                        'screen' => $lastStep ? 'StepDetail' : 'PlanDetail',
                        'planId' => $plan->id,
                        'stepId' => $lastStep?->id,
                    ]),
                    'dedupeKey' => 'plan:'.$plan->id,
                    'categoryId' => $lastStep ? 'step_reminder' : null,
                ];

                // Skipped deliberately: a plan on its last step is also
                // past halfway, and saying both about the same plan in one
                // message reads like a bug.
                continue;
            }

            if ($done > 0 && $done / $total >= 0.5) {
                $candidates[] = [
                    'type' => NotificationType::PlanHalfway,
                    'title' => ($plan->emoji ? $plan->emoji.' ' : '').$plan->title.' is halfway done',
                    'body' => "{$done} of {$total} steps complete.",
                    'clause' => $plan->title.' is halfway done.',
                    'data' => ['screen' => 'PlanDetail', 'planId' => $plan->id],
                    'dedupeKey' => 'plan:'.$plan->id,
                    'categoryId' => null,
                ];
            }
        }

        return $candidates;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function streaks(User $user, Carbon $localNow): array
    {
        $days = $this->completionDays($user, $localNow);

        if ($days === []) {
            return [];
        }

        $today = $localNow->toDateString();
        $yesterday = $localNow->copy()->subDay()->toDateString();

        // A streak that already includes today isn't at risk, and its
        // milestone (if any) was reported this morning before the user
        // extended it.
        if (in_array($today, $days, true)) {
            return [];
        }

        if (! in_array($yesterday, $days, true)) {
            return [];
        }

        $streak = $this->streakLengthEndingAt($days, $localNow->copy()->subDay());

        if (in_array($streak, self::STREAK_MILESTONES, true)) {
            return [[
                'type' => NotificationType::StreakMilestone,
                'title' => "{$streak}-day streak",
                'body' => "You've finished something every day for {$streak} days.",
                'clause' => "You're on a {$streak}-day streak.",
                'data' => ['screen' => 'Today'],
                'dedupeKey' => 'streak:'.$streak,
                'categoryId' => null,
            ]];
        }

        // Below this a "streak" isn't yet a thing anyone feels they have,
        // and telling them they're about to lose one is just pressure.
        if ($streak < 2) {
            return [];
        }

        return [[
            'type' => NotificationType::StreakAtRisk,
            // Framed as something they have, not something they're about
            // to lose — the same fact, minus the coercion.
            'title' => "You're on a {$streak}-day streak",
            'body' => 'Finish a step today to keep it going.',
            'clause' => "Your {$streak}-day streak is still alive.",
            'data' => ['screen' => 'Today'],
            'dedupeKey' => 'day:'.$today,
            'categoryId' => null,
        ]];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function weeklyRecap(User $user, Carbon $localNow): array
    {
        if (! $localNow->isSunday()) {
            return [];
        }

        $since = $localNow->copy()->subDays(7)->startOfDay();

        $steps = PlanStep::query()
            ->whereNotNull('completed_at')
            ->where('completed_at', '>=', $since->copy()->utc())
            ->whereIn('plan_id', $user->plans()->select('id'))
            ->get(['plan_id']);

        // Nobody needs a report telling them they did nothing.
        if ($steps->isEmpty()) {
            return [];
        }

        $count = $steps->count();
        $plans = $steps->pluck('plan_id')->unique()->count();

        return [[
            'type' => NotificationType::WeeklyRecap,
            'title' => $count === 1 ? 'One step done this week' : "{$count} steps done this week",
            'body' => $plans === 1 ? 'All in one plan. Nice run.' : "Across {$plans} plans. Nice run.",
            'clause' => "{$count} steps done this week.",
            'data' => ['screen' => 'Today'],
            'dedupeKey' => 'week:'.$localNow->isoWeekYear.'-'.$localNow->isoWeek,
            'categoryId' => null,
        ]];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function accountNotices(User $user, Carbon $localNow): array
    {
        $candidates = [];

        $expiresAt = $user->subscription_expires_at;

        // A null expiry on a paid tier is a lifetime entitlement, not one
        // that lapsed at an unknown time — see User::hasActiveSubscription().
        if ($user->effectiveTier() !== 'free'
            && $expiresAt !== null
            && $expiresAt->isFuture()
            && $expiresAt->diffInDays(Carbon::now()) <= self::EXPIRY_WARNING_DAYS) {
            $candidates[] = [
                'type' => NotificationType::SubscriptionExpiring,
                'title' => 'Your subscription ends soon',
                'body' => 'Renew to keep generating new plans.',
                'clause' => 'Your subscription ends soon.',
                'data' => ['screen' => 'Settings'],
                'dedupeKey' => 'expiry:'.$expiresAt->toDateString(),
                'categoryId' => null,
            ];
        }

        // Only worth saying to someone who actually ran out — and only on a
        // paid tier, since the free tier's allowance is zero and "your 0
        // generations refreshed" is not a message.
        if ($user->effectiveTier() !== 'free'
            && $user->generation_period_started_at !== null
            && $user->generation_period_started_at->lt(Carbon::now()->subMonth())
            && $user->plans_generated_count >= $user->monthlyGenerationLimit()) {
            $limit = $user->monthlyGenerationLimit();

            $candidates[] = [
                'type' => NotificationType::GenerationsRefreshed,
                'title' => 'Your plan generations just refreshed',
                'body' => "You have {$limit} again. What's next?",
                'clause' => 'Your generations have refreshed.',
                'data' => ['screen' => 'NewPlan'],
                'dedupeKey' => 'period:'.$localNow->toDateString(),
                'categoryId' => null,
            ];
        }

        // Unverified accounts can't generate at all, so this unblocks the
        // app's core action. Exactly once, a day after signing up — the
        // in-app banner is already doing this work the rest of the time.
        if ($user->email_verified_at === null
            && $user->created_at !== null
            && $user->created_at->lt(Carbon::now()->subDay())) {
            $candidates[] = [
                'type' => NotificationType::VerifyEmailReminder,
                'title' => 'Confirm your email to start building plans',
                'body' => 'It takes one tap, and unlocks plan generation.',
                'clause' => 'Your email still needs confirming.',
                'data' => ['screen' => 'Today'],
                'dedupeKey' => 'once',
                'categoryId' => null,
            ];
        }

        return $candidates;
    }

    /**
     * The distinct local dates on which this user finished at least one
     * step, newest first.
     *
     * Bucketed in PHP rather than with a SQL date function because the two
     * databases in play (Postgres in production, SQLite under test) spell
     * that differently, and because the boundary that matters is the
     * user's local midnight, not the server's.
     *
     * @return array<int, string>
     */
    private function completionDays(User $user, Carbon $localNow): array
    {
        $timestamps = PlanStep::query()
            ->whereNotNull('completed_at')
            ->where('completed_at', '>=', Carbon::now()->subDays(400))
            ->whereIn('plan_id', $user->plans()->select('id'))
            ->orderByDesc('completed_at')
            ->pluck('completed_at');

        return $timestamps
            ->map(fn (Carbon $at) => $at->copy()->setTimezone($localNow->timezone)->toDateString())
            ->unique()
            ->values()
            ->all();
    }

    /**
     * How many consecutive days ending on $end have a completion.
     *
     * @param  array<int, string>  $days
     */
    private function streakLengthEndingAt(array $days, Carbon $end): int
    {
        $set = array_flip($days);
        $streak = 0;
        $cursor = $end->copy();

        while (isset($set[$cursor->toDateString()])) {
            $streak++;
            $cursor->subDay();
        }

        return $streak;
    }
}
