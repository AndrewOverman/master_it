<?php

namespace Tests\Feature;

use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PlanRetryTest extends TestCase
{
    use RefreshDatabase;

    private function makePlan(User $user, string $status, array $overrides = []): Plan
    {
        return Plan::create(array_merge([
            'user_id' => $user->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => $status,
        ], $overrides));
    }

    public function test_a_failed_plan_can_be_retried(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $plan = $this->makePlan($user, 'failed', ['error_message' => 'the model exploded']);

        $response = $this->actingAs($user)->postJson("/api/v1/plans/{$plan->id}/retry");

        $response->assertStatus(202)->assertJson(['id' => $plan->id, 'status' => 'generating']);

        $plan->refresh();
        $this->assertSame('generating', $plan->status);
        $this->assertNull($plan->error_message);
        Queue::assertPushed(GeneratePlanSteps::class);
    }

    /**
     * store() charges the allowance on dispatch and never refunds it, so a
     * retry must not charge again — otherwise one plan the user never
     * received costs them two generations.
     */
    public function test_retrying_does_not_consume_another_generation(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $plan = $this->makePlan($user, 'failed');
        // fresh(), not the in-memory model — the factory doesn't set this
        // column, so it reads null until the DB default is loaded back.
        $before = $user->fresh()->plans_generated_count;

        $this->actingAs($user)->postJson("/api/v1/plans/{$plan->id}/retry")->assertStatus(202);

        $this->assertSame($before, $user->fresh()->plans_generated_count);
    }

    /**
     * The original inputs live on the plan row, so a retry reuses them
     * rather than asking the user to re-enter anything.
     */
    public function test_retrying_reuses_the_original_inputs(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $plan = $this->makePlan($user, 'failed', [
            'original_prompt' => 'I want to learn to play basic chords on guitar',
            'skill_level' => 'beginner',
            'time_commitment' => 'light',
            'target_days' => 30,
        ]);

        $this->actingAs($user)->postJson("/api/v1/plans/{$plan->id}/retry")->assertStatus(202);

        $plan->refresh();
        $this->assertSame('I want to learn to play basic chords on guitar', $plan->original_prompt);
        $this->assertSame('beginner', $plan->skill_level);
        $this->assertSame('light', $plan->time_commitment);
        $this->assertSame(30, $plan->target_days);
    }

    public function test_a_rejected_plan_cannot_be_retried(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $plan = $this->makePlan($user, 'rejected');

        $this->actingAs($user)->postJson("/api/v1/plans/{$plan->id}/retry")->assertStatus(409);

        $this->assertSame('rejected', $plan->fresh()->status);
        Queue::assertNothingPushed();
    }

    public function test_a_ready_plan_cannot_be_retried(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $plan = $this->makePlan($user, 'ready');

        $this->actingAs($user)->postJson("/api/v1/plans/{$plan->id}/retry")->assertStatus(409);

        Queue::assertNothingPushed();
    }

    public function test_a_non_owner_cannot_retry_a_plan(): void
    {
        Queue::fake();
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $plan = $this->makePlan($owner, 'failed');

        $this->actingAs($intruder)->postJson("/api/v1/plans/{$plan->id}/retry")->assertStatus(404);

        $this->assertSame('failed', $plan->fresh()->status);
        Queue::assertNothingPushed();
    }
}
