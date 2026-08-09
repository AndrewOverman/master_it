<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlanStepCompletionTest extends TestCase
{
    use RefreshDatabase;

    private function makePlan(User $user, int $stepCount = 2): Plan
    {
        $plan = Plan::create([
            'user_id' => $user->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
        ]);

        for ($order = 1; $order <= $stepCount; $order++) {
            $plan->steps()->create([
                'order' => $order,
                'title' => "Step {$order}",
                'description' => 'Do the thing.',
                'estimated_days' => 3,
            ]);
        }

        return $plan->refresh();
    }

    public function test_a_step_can_be_uncompleted_after_every_step_is_complete(): void
    {
        $user = User::factory()->create();
        $plan = $this->makePlan($user);
        $plan->steps()->update(['completed_at' => now()]);
        $step = $plan->steps()->first();

        $response = $this->actingAs($user)
            ->patchJson("/api/v1/plans/{$plan->id}/steps/{$step->id}", ['completed' => false]);

        $response->assertOk();
        $this->assertNull($step->fresh()->completed_at);
    }

    public function test_a_step_can_be_uncompleted_while_the_plan_is_still_in_progress(): void
    {
        $user = User::factory()->create();
        $plan = $this->makePlan($user);
        $step = $plan->steps()->first();
        $step->update(['completed_at' => now()]);

        $response = $this->actingAs($user)
            ->patchJson("/api/v1/plans/{$plan->id}/steps/{$step->id}", ['completed' => false]);

        $response->assertOk();
        $this->assertNull($step->fresh()->completed_at);
    }

    /**
     * The client replays the completion celebration each time the last step
     * is checked, so the API has to keep letting the plan cross that line.
     */
    public function test_a_plan_can_be_completed_more_than_once(): void
    {
        $user = User::factory()->create();
        $plan = $this->makePlan($user);
        $plan->steps()->update(['completed_at' => now()]);
        $step = $plan->steps()->first();

        $this->actingAs($user)
            ->patchJson("/api/v1/plans/{$plan->id}/steps/{$step->id}", ['completed' => false])
            ->assertOk();

        $this->actingAs($user)
            ->patchJson("/api/v1/plans/{$plan->id}/steps/{$step->id}", ['completed' => true])
            ->assertOk();

        $this->assertSame(
            $plan->steps()->count(),
            $plan->steps()->whereNotNull('completed_at')->count()
        );
    }

    public function test_a_due_date_can_still_be_edited_on_a_completed_plan(): void
    {
        $user = User::factory()->create();
        $plan = $this->makePlan($user);
        $plan->steps()->update(['completed_at' => now()]);
        $step = $plan->steps()->first();

        $response = $this->actingAs($user)
            ->patchJson("/api/v1/plans/{$plan->id}/steps/{$step->id}", ['due_date' => '2026-09-01']);

        $response->assertOk();
        $this->assertSame('2026-09-01', $step->fresh()->due_date->toDateString());
    }

    public function test_a_non_owner_cannot_change_a_step(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $plan = $this->makePlan($owner);
        $step = $plan->steps()->first();

        $this->actingAs($intruder)
            ->patchJson("/api/v1/plans/{$plan->id}/steps/{$step->id}", ['completed' => true])
            ->assertStatus(404);

        $this->assertNull($step->fresh()->completed_at);
    }
}
