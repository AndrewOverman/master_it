<?php

namespace App\Jobs;

use App\Models\Plan;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * Asks Claude to break the plan's original prompt into a concrete, ordered
 * set of steps (tailored to the goal, skill level, time commitment, and
 * target length), then persists them.
 */
class GeneratePlanSteps implements ShouldQueue
{
    use Queueable;

    // Placeholder until real per-topic video search/LLM integration exists:
    // a generic, well-known talk on the mechanics of skill acquisition,
    // attached to the first step only so not every step has a video.
    private const PLACEHOLDER_VIDEO_URL = 'https://www.youtube.com/watch?v=5MgBikgcWnY';

    public function __construct(
        public Plan $plan,
    ) {}

    public function handle(): void
    {
        $steps = $this->generateStepsFromClaude();

        $cumulativeDays = 0;

        foreach ($steps as $index => $step) {
            $cumulativeDays += $step['estimated_days'];

            $this->plan->steps()->create([
                'order' => $index + 1,
                'title' => $step['title'],
                'description' => $step['description'],
                'estimated_days' => $step['estimated_days'],
                'due_date' => $this->plan->created_at->copy()->addDays($cumulativeDays),
                'video_url' => $index === 0 ? self::PLACEHOLDER_VIDEO_URL : null,
            ]);
        }

        $this->plan->update(['status' => 'ready']);
    }

    /**
     * @return array<int, array{title: string, description: string, estimated_days: int}>
     */
    private function generateStepsFromClaude(): array
    {
        $apiKey = config('services.anthropic.api_key');

        if (! $apiKey) {
            throw new RuntimeException('ANTHROPIC_API_KEY is not configured.');
        }

        $response = Http::withHeaders([
            'x-api-key' => $apiKey,
            'anthropic-version' => '2023-06-01',
        ])
            ->timeout(60)
            ->retry(2, 1000)
            ->post('https://api.anthropic.com/v1/messages', [
                'model' => config('services.anthropic.model'),
                'max_tokens' => 2048,
                'tools' => [[
                    'name' => 'create_plan_steps',
                    'description' => 'Return a structured, ordered list of steps for a personalized goal plan.',
                    'input_schema' => [
                        'type' => 'object',
                        'properties' => [
                            'steps' => [
                                'type' => 'array',
                                'minItems' => 3,
                                'maxItems' => 8,
                                'items' => [
                                    'type' => 'object',
                                    'properties' => [
                                        'title' => ['type' => 'string'],
                                        'description' => ['type' => 'string'],
                                        'estimated_days' => ['type' => 'integer', 'minimum' => 1],
                                    ],
                                    'required' => ['title', 'description', 'estimated_days'],
                                ],
                            ],
                        ],
                        'required' => ['steps'],
                    ],
                ]],
                'tool_choice' => ['type' => 'tool', 'name' => 'create_plan_steps'],
                'messages' => [
                    ['role' => 'user', 'content' => $this->buildPrompt()],
                ],
            ]);

        if ($response->failed()) {
            throw new RuntimeException('Anthropic API request failed: '.$response->body());
        }

        $toolUse = collect($response->json('content'))->firstWhere('type', 'tool_use');
        $steps = $toolUse['input']['steps'] ?? null;

        // Claude occasionally returns nested tool input fields as a
        // JSON-encoded string instead of a native array; decode defensively.
        if (is_string($steps)) {
            $steps = json_decode($steps, true);
        }

        if (! is_array($steps) || empty($steps)) {
            throw new RuntimeException('Anthropic response did not include any usable steps.');
        }

        return $steps;
    }

    private function buildPrompt(): string
    {
        $totalDays = $this->plan->target_days ?? 30;
        $skillLevel = $this->plan->skill_level ?? 'unspecified';
        $timeCommitment = $this->plan->time_commitment ?? 'unspecified';

        return <<<PROMPT
            Create a personalized, step-by-step plan to help someone achieve this goal:
            "{$this->plan->original_prompt}"

            Details about them:
            - Skill level: {$skillLevel}
            - Time they can commit: {$timeCommitment}
            - The plan should span approximately {$totalDays} days in total

            Break this into 4-7 sequential steps that are concrete and specific to this
            exact goal (not generic advice that could apply to any goal). Each step needs
            a short title, a 1-2 sentence actionable description, and an estimated number
            of days. The estimated_days across all steps should sum to approximately
            {$totalDays}.
            PROMPT;
    }

    public function failed(Throwable $exception): void
    {
        $this->plan->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
        ]);
    }
}
