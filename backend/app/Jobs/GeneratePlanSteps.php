<?php

namespace App\Jobs;

use App\Models\Plan;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Placeholder generator: breaks a plan into a fixed set of generic phases,
 * spaced out over the plan's target_days. Swap the body of handle() for a
 * real LLM-driven breakdown of $plan->original_prompt when ready.
 */
class GeneratePlanSteps implements ShouldQueue
{
    use Queueable;

    private const PHASES = [
        ['title' => 'Learn the fundamentals', 'description' => 'Build a foundation by learning the core concepts and terminology.'],
        ['title' => 'Practice the basics', 'description' => 'Apply what you learned through small, focused exercises.'],
        ['title' => 'Build something real', 'description' => 'Put the fundamentals to use in a small project.'],
        ['title' => 'Refine and troubleshoot', 'description' => 'Identify weak spots and revisit anything that did not click.'],
        ['title' => 'Put it to the test', 'description' => 'Do a final review or challenge to confirm you have got it.'],
    ];

    public function __construct(
        public Plan $plan,
    ) {}

    public function handle(): void
    {
        $totalDays = $this->plan->target_days ?? 30;
        $stepCount = count(self::PHASES);
        $daysPerStep = max(1, intdiv($totalDays, $stepCount));

        $cumulativeDays = 0;

        foreach (self::PHASES as $index => $phase) {
            $cumulativeDays += $daysPerStep;

            $this->plan->steps()->create([
                'order' => $index + 1,
                'title' => $phase['title'],
                'description' => $phase['description'],
                'estimated_days' => $daysPerStep,
                'due_date' => $this->plan->created_at->copy()->addDays($cumulativeDays),
            ]);
        }

        $this->plan->update(['status' => 'ready']);
    }

    public function failed(Throwable $exception): void
    {
        $this->plan->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
        ]);
    }
}
