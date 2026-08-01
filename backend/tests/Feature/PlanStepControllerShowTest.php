<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\PlanStep;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PlanStepControllerShowTest extends TestCase
{
    use RefreshDatabase;

    private function makeStep(User $user, array $stepOverrides = []): PlanStep
    {
        $plan = Plan::create([
            'user_id' => $user->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
        ]);

        return $plan->steps()->create(array_merge([
            'order' => 1,
            'title' => 'Step One',
            'description' => 'Do the first thing.',
            'estimated_days' => 3,
        ], $stepOverrides));
    }

    private function fakeToolUseResponse(array $resources): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [
                    [
                        'type' => 'tool_use',
                        'name' => 'report_resources',
                        'input' => ['resources' => $resources],
                    ],
                ],
                'usage' => ['input_tokens' => 100],
            ]),
        ]);
    }

    public function test_returns_404_when_step_belongs_to_another_users_plan(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $step = $this->makeStep($owner);

        $response = $this->actingAs($intruder)->getJson("/api/v1/plans/{$step->plan_id}/steps/{$step->id}");

        $response->assertStatus(404);
    }

    public function test_returns_404_when_step_does_not_belong_to_plan(): void
    {
        $user = User::factory()->create();
        $stepA = $this->makeStep($user);
        $stepB = $this->makeStep($user);

        $response = $this->actingAs($user)->getJson("/api/v1/plans/{$stepA->plan_id}/steps/{$stepB->id}");

        $response->assertStatus(404);
    }

    public function test_fetches_and_persists_resources_on_first_view(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);
        $user = User::factory()->create();
        $step = $this->makeStep($user);

        $this->fakeToolUseResponse([
            ['url' => 'https://example.com/a', 'title' => 'A', 'source' => 'Example', 'description' => 'Useful.'],
        ]);

        $response = $this->actingAs($user)->getJson("/api/v1/plans/{$step->plan_id}/steps/{$step->id}");

        $response->assertOk();
        $response->assertJsonCount(1, 'resources');
        $response->assertJsonPath('resources.0.url', 'https://example.com/a');

        $this->assertDatabaseCount('step_resources', 1);
        $this->assertNotNull($step->fresh()->resources_fetched_at);
    }

    public function test_does_not_refetch_resources_on_second_view(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);
        $user = User::factory()->create();
        $step = $this->makeStep($user);

        $this->fakeToolUseResponse([
            ['url' => 'https://example.com/a', 'title' => 'A'],
        ]);

        $this->actingAs($user)->getJson("/api/v1/plans/{$step->plan_id}/steps/{$step->id}")->assertOk();
        $this->actingAs($user)->getJson("/api/v1/plans/{$step->plan_id}/steps/{$step->id}")->assertOk();

        Http::assertSentCount(1);
        $this->assertDatabaseCount('step_resources', 1);
    }

    public function test_skips_fetch_and_still_returns_step_when_anthropic_not_configured(): void
    {
        config(['services.anthropic.api_key' => null]);
        $user = User::factory()->create();
        $step = $this->makeStep($user);

        Http::fake();

        $response = $this->actingAs($user)->getJson("/api/v1/plans/{$step->plan_id}/steps/{$step->id}");

        $response->assertOk();
        $response->assertJsonCount(0, 'resources');
        Http::assertNothingSent();
        $this->assertNull($step->fresh()->resources_fetched_at);
    }

    public function test_resources_are_shared_across_copies_of_the_same_featured_plan(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);

        // Two independent copies of the same featured plan, made before
        // anyone has viewed the step on either the featured plan or a
        // copy — so neither copy's `resources_fetched_at` is set yet.
        $featuredPlan = Plan::create([
            'user_id' => User::factory()->create()->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
        ]);
        $featuredPlan->is_featured = true;
        $featuredPlan->save();
        $featuredStep = $featuredPlan->steps()->create([
            'order' => 1,
            'title' => 'Step One',
            'description' => 'Do the first thing.',
        ]);

        $userA = User::factory()->create();
        $copyA = Plan::create([
            'user_id' => $userA->id,
            'source_plan_id' => $featuredPlan->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
        ]);
        $stepA = $copyA->steps()->create(['order' => 1, 'title' => 'Step One', 'description' => 'Do the first thing.']);

        $userB = User::factory()->create();
        $copyB = Plan::create([
            'user_id' => $userB->id,
            'source_plan_id' => $featuredPlan->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
        ]);
        $stepB = $copyB->steps()->create(['order' => 1, 'title' => 'Step One', 'description' => 'Do the first thing.']);

        $this->fakeToolUseResponse([
            ['url' => 'https://example.com/a', 'title' => 'A', 'source' => 'Example', 'description' => 'Useful.'],
        ]);

        // First view, on user A's copy, is the only Claude call that should ever happen.
        $this->actingAs($userA)->getJson("/api/v1/plans/{$copyA->id}/steps/{$stepA->id}")
            ->assertOk()
            ->assertJsonCount(1, 'resources')
            ->assertJsonPath('resources.0.url', 'https://example.com/a');

        Http::assertSentCount(1);

        // The search result was written back to the featured (canonical) step too.
        $this->assertNotNull($featuredStep->fresh()->resources_fetched_at);
        $this->assertDatabaseCount('step_resources', 2);

        // A second, independent copy reuses the canonical step's resources — zero new API calls.
        $this->actingAs($userB)->getJson("/api/v1/plans/{$copyB->id}/steps/{$stepB->id}")
            ->assertOk()
            ->assertJsonCount(1, 'resources')
            ->assertJsonPath('resources.0.url', 'https://example.com/a');

        Http::assertSentCount(1);
        $this->assertDatabaseCount('step_resources', 3);
    }
}
