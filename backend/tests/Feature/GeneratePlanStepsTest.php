<?php

namespace Tests\Feature;

use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class GeneratePlanStepsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Deterministic regardless of the developer's local .env: a
        // configured Anthropic key (so the job doesn't bail out before ever
        // calling Http::), and an explicitly unconfigured YouTube key (so
        // findVideoForStep()'s search() short-circuits to null without
        // needing its own Http::fake() stub).
        config([
            'services.anthropic.api_key' => 'test-key',
            'services.youtube.api_key' => null,
        ]);
    }

    private function fakeAnthropicSteps(array $steps, string $emoji = '🎯'): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [[
                    'type' => 'tool_use',
                    'name' => 'create_plan_steps',
                    'input' => ['emoji' => $emoji, 'steps' => $steps],
                ]],
                'usage' => [],
            ]),
        ]);
    }

    /**
     * The step count is decided by the job, not by Claude, so the only place
     * it's observable is the outgoing user message.
     */
    private function assertRequestedStepCount(int $expected): void
    {
        Http::assertSent(function ($request) use ($expected) {
            $userMessage = $request->data()['messages'][0]['content'];

            return str_contains($userMessage, "Number of steps: exactly {$expected}");
        });
    }

    private function planWith(array $attributes): Plan
    {
        return Plan::create([
            'user_id' => User::factory()->create()->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'generating',
            ...$attributes,
        ]);
    }

    /**
     * @return list<array{0: array<string, mixed>, 1: int}>
     */
    public static function stepBudgetProvider(): array
    {
        return [
            // 14 / (4.5 * 0.75 beginner) = 4.1
            'short plan, beginner, moderate' => [
                ['target_days' => 14, 'skill_level' => 'beginner', 'time_commitment' => 'moderate'], 4,
            ],
            // 14 / 2.5 = 5.6 — the same fortnight carries more steps when
            // there's more time per day to spend on them.
            'short plan, advanced, intensive' => [
                ['target_days' => 14, 'skill_level' => 'advanced', 'time_commitment' => 'intensive'], 6,
            ],
            // 180 / 7 = 25.7, capped: long plans get longer steps, not more.
            'long plan clamps to the maximum' => [
                ['target_days' => 180, 'skill_level' => 'advanced', 'time_commitment' => 'light'], 8,
            ],
            // Falls back to 30 days at the default ideal length: 30 / 4.5 = 6.7
            'unspecified everything falls back to the defaults' => [
                [], 7,
            ],
            // Every step costs at least a day, so a 3-day plan can't honestly
            // carry the usual 4-step floor.
            'a very short plan cannot exceed its own day count' => [
                ['target_days' => 3, 'skill_level' => 'beginner', 'time_commitment' => 'light'], 3,
            ],
        ];
    }

    #[DataProvider('stepBudgetProvider')]
    public function test_the_step_count_is_derived_from_plan_length_and_time_commitment(
        array $attributes,
        int $expectedSteps,
    ): void {
        $this->fakeAnthropicSteps([
            ['title' => 'Step One', 'description' => 'Do the first thing.', 'estimated_days' => 5, 'needs_video' => false],
        ]);

        GeneratePlanSteps::dispatch($this->planWith($attributes));

        $this->assertRequestedStepCount($expectedSteps);
    }

    public function test_a_refinement_asks_for_the_same_step_count_as_the_original(): void
    {
        $plan = $this->planWith([
            'target_days' => 14,
            'skill_level' => 'advanced',
            'time_commitment' => 'intensive',
            'status' => 'ready',
        ]);

        $plan->steps()->create([
            'order' => 1,
            'title' => 'Step One',
            'description' => 'Do the first thing.',
            'estimated_days' => 14,
        ]);

        $plan->refinements()->create(['tags' => ['more_detail'], 'status' => 'pending']);

        $this->fakeAnthropicSteps([
            ['title' => 'Step One', 'description' => 'Do the first thing, in detail.', 'estimated_days' => 14, 'needs_video' => false],
        ]);

        GeneratePlanSteps::dispatch($plan->fresh(), isRefinement: true);

        $this->assertRequestedStepCount(6);
    }

    /**
     * Regression test for GeneratePlanSteps.php:272 — Claude occasionally
     * returns one individual step as a JSON-encoded string inside an
     * otherwise properly-typed steps array (independent of the existing
     * whole-array stringification case), which used to crash with
     * "Cannot access offset of type string on string" on estimated_days.
     */
    public function test_a_stringified_individual_step_does_not_crash_generation(): void
    {
        $user = User::factory()->create();
        $plan = Plan::create([
            'user_id' => $user->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'generating',
            'skill_level' => 'beginner',
            'time_commitment' => 'moderate',
            'target_days' => 10,
        ]);

        $this->fakeAnthropicSteps([
            ['title' => 'Step One', 'description' => 'Do the first thing.', 'estimated_days' => 5, 'needs_video' => false],
            json_encode(['title' => 'Step Two', 'description' => 'Do the second thing.', 'estimated_days' => 5, 'needs_video' => false]),
        ]);

        GeneratePlanSteps::dispatch($plan);

        $plan->refresh();
        $this->assertSame('ready', $plan->status);
        $this->assertSame(
            ['Step One', 'Step Two'],
            $plan->steps()->orderBy('order')->pluck('title')->all()
        );
    }
}
