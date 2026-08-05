<?php

namespace Tests\Feature;

use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeneratePlanStepsRefinementTest extends TestCase
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

    private function makeReadyPlanWithSteps(User $user, array $overrides = []): Plan
    {
        // created_at isn't fillable (Eloquent would just overwrite it with
        // now() on insert otherwise) — same workaround PlanSharingTest's
        // makePlan() uses for its own non-fillable overrides.
        $createdAt = $overrides['created_at'] ?? null;
        unset($overrides['created_at']);

        $plan = Plan::create(array_merge([
            'user_id' => $user->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
            'skill_level' => 'beginner',
            'time_commitment' => 'moderate',
            'target_days' => 30,
        ], $overrides));

        if ($createdAt !== null) {
            $plan->forceFill(['created_at' => $createdAt])->save();
        }

        $plan->steps()->create([
            'order' => 1,
            'title' => 'Original Step One',
            'description' => 'Do the first thing.',
            'estimated_days' => 5,
        ]);
        $plan->steps()->create([
            'order' => 2,
            'title' => 'Original Step Two',
            'description' => 'Do the second thing.',
            'estimated_days' => 5,
        ]);

        return $plan;
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

    private function fakeAnthropicRejection(string $category = 'illegal'): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [[
                    'type' => 'tool_use',
                    'name' => 'flag_unsupported_goal',
                    'input' => ['category' => $category, 'reason' => 'test'],
                ]],
                'usage' => [],
            ]),
        ]);
    }

    private function fakeAnthropicFailure(): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response(['error' => 'boom'], 500),
        ]);
    }

    public function test_refinement_prompt_includes_current_steps_and_requested_changes(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlanWithSteps($user);
        $plan->refinements()->create(['tags' => ['no_equipment'], 'notes' => 'Make it fun', 'status' => 'pending']);

        $this->fakeAnthropicSteps([
            ['title' => 'New Step', 'description' => 'Do a new thing.', 'estimated_days' => 10, 'needs_video' => false],
        ]);

        GeneratePlanSteps::dispatch($plan, isRefinement: true);

        Http::assertSent(function (Request $request) {
            $body = $request['messages'][0]['content'];

            return str_contains($body, 'Original Step One')
                && str_contains($body, 'Original Step Two')
                && str_contains($body, 'Avoid steps that require special equipment')
                && str_contains($body, 'Make it fun');
        });
    }

    public function test_due_dates_anchor_on_now_for_a_refinement(): void
    {
        Carbon::setTestNow('2026-01-01 00:00:00');
        $user = User::factory()->create();
        $plan = $this->makeReadyPlanWithSteps($user, ['created_at' => '2025-01-01 00:00:00']);
        $plan->refinements()->create(['tags' => ['shorter_timeline'], 'status' => 'pending']);

        $this->fakeAnthropicSteps([
            ['title' => 'New Step', 'description' => 'Do a new thing.', 'estimated_days' => 4, 'needs_video' => false],
        ]);

        GeneratePlanSteps::dispatch($plan, isRefinement: true);

        $newStep = $plan->fresh()->steps()->sole();
        // Anchored on "now" (2026-01-01) + 4 days, not the plan's 2025
        // created_at — confirms the refinement path re-anchors instead of
        // inheriting the original-generation due-date logic verbatim.
        $this->assertTrue($newStep->due_date->isSameDay(Carbon::parse('2026-01-05')));

        Carbon::setTestNow();
    }

    public function test_successful_refinement_replaces_steps_and_marks_refinement_applied(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlanWithSteps($user);
        $refinement = $plan->refinements()->create(['tags' => ['more_detail'], 'status' => 'pending']);
        $originalStepIds = $plan->steps()->pluck('id');

        $this->fakeAnthropicSteps([
            ['title' => 'Revised Step', 'description' => 'A revised description.', 'estimated_days' => 8, 'needs_video' => false],
        ], emoji: '🚀');

        GeneratePlanSteps::dispatch($plan, isRefinement: true);

        $plan->refresh();
        $this->assertSame('ready', $plan->status);
        $this->assertSame('🚀', $plan->emoji);
        $this->assertCount(1, $plan->steps);
        $this->assertSame('Revised Step', $plan->steps->first()->title);
        $this->assertEmpty(array_intersect($originalStepIds->all(), $plan->steps->pluck('id')->all()));
        $this->assertSame('applied', $refinement->fresh()->status);
    }

    public function test_rejected_response_during_refinement_keeps_plan_ready_not_rejected(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlanWithSteps($user);
        $refinement = $plan->refinements()->create(['tags' => ['no_equipment'], 'status' => 'pending']);
        $originalTitles = $plan->steps()->pluck('title');

        $this->fakeAnthropicRejection();

        GeneratePlanSteps::dispatch($plan, isRefinement: true);

        $plan->refresh();
        // Must never land in "rejected" — that screen's only recovery path
        // is starting a brand new plan, which would bury this one even
        // though it's still sitting here untouched.
        $this->assertSame('ready', $plan->status);
        $this->assertNull($plan->rejection_category);
        $this->assertSame($originalTitles->all(), $plan->steps()->pluck('title')->all());
        $this->assertSame('failed', $refinement->fresh()->status);
    }

    public function test_a_failed_refinement_leaves_the_plan_ready_with_its_original_steps(): void
    {
        // Regression test for the handle()/failed() serialization boundary:
        // isRefinement must be a constructor property (surviving the
        // queue's independent re-unserialize before failed() runs), not
        // inferred inside handle() from e.g. steps()->exists() — an
        // inferred flag would silently be lost here and this test would
        // see status "failed" instead of "ready".
        $user = User::factory()->create();
        $plan = $this->makeReadyPlanWithSteps($user);
        $refinement = $plan->refinements()->create(['tags' => ['no_equipment'], 'status' => 'pending']);
        $originalTitles = $plan->steps()->pluck('title');

        $this->fakeAnthropicFailure();

        // Dispatched for real (QUEUE_CONNECTION=sync per phpunit.xml)
        // rather than Queue::fake() or calling ->handle()/->failed()
        // directly, so this actually exercises CallQueuedHandler's real
        // dispatch-then-fail path. SyncQueue::handleException() calls the
        // job's failed() (what we're testing) and then deliberately
        // re-throws the original exception to the caller by design — we
        // only care about failed()'s DB side effects, so swallow it here.
        try {
            GeneratePlanSteps::dispatch($plan, isRefinement: true);
        } catch (\Throwable $e) {
            // Expected — see comment above.
        }

        $plan->refresh();
        $this->assertSame('ready', $plan->status);
        $this->assertNull($plan->error_message);
        $this->assertSame($originalTitles->all(), $plan->steps()->pluck('title')->all());
        $this->assertSame('failed', $refinement->fresh()->status);
    }
}
