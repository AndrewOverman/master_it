<?php

namespace Tests\Feature;

use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use App\Models\PlanRefinement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PlanRefinementTest extends TestCase
{
    use RefreshDatabase;

    private function makeReadyPlan(User $user, array $overrides = []): Plan
    {
        return Plan::create(array_merge([
            'user_id' => $user->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
        ], $overrides));
    }

    private function makeSubscribedUser(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'subscription_tier' => 'starter',
            'subscription_expires_at' => now()->addMonth(),
        ], $overrides));
    }

    private function refine(User $user, Plan $plan, array $payload = ['tags' => ['no_equipment']]): TestResponse
    {
        return $this->actingAs($user)->postJson("/api/v1/plans/{$plan->id}/refine", $payload);
    }

    public function test_owner_can_refine_a_ready_plan(): void
    {
        Queue::fake();
        $user = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($user);

        $response = $this->refine($user, $plan, ['tags' => ['no_equipment'], 'notes' => 'Please simplify']);

        $response->assertStatus(202);
        $response->assertJson(['id' => $plan->id, 'status' => 'generating']);
        $this->assertSame('generating', $plan->fresh()->status);

        $refinement = PlanRefinement::where('plan_id', $plan->id)->sole();
        $this->assertSame('pending', $refinement->status);
        $this->assertSame(['no_equipment'], $refinement->tags);
        $this->assertSame('Please simplify', $refinement->notes);

        Queue::assertPushed(GeneratePlanSteps::class, fn ($job) => $job->plan->id === $plan->id && $job->isRefinement === true);
    }

    public function test_refining_consumes_the_generation_allowance(): void
    {
        Queue::fake();
        $user = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($user);

        $this->refine($user, $plan);

        $this->assertSame(1, $user->fresh()->plans_generated_count);
    }

    public function test_non_owner_cannot_refine_a_plan(): void
    {
        Queue::fake();
        $owner = $this->makeSubscribedUser();
        $intruder = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($owner);

        $this->refine($intruder, $plan)->assertStatus(404);
        Queue::assertNotPushed(GeneratePlanSteps::class);
    }

    public function test_cannot_refine_a_plan_that_is_not_ready(): void
    {
        Queue::fake();
        $user = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($user, ['status' => 'generating']);

        $this->refine($user, $plan)->assertStatus(422);
        Queue::assertNotPushed(GeneratePlanSteps::class);
    }

    public function test_refine_requires_at_least_one_tag_or_note(): void
    {
        Queue::fake();
        $user = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($user);

        $this->refine($user, $plan, [])->assertStatus(422);
        Queue::assertNotPushed(GeneratePlanSteps::class);
    }

    public function test_invalid_tag_is_rejected(): void
    {
        Queue::fake();
        $user = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($user);

        $this->refine($user, $plan, ['tags' => ['not_a_real_tag']])->assertStatus(422);
    }

    public function test_notes_over_280_characters_are_rejected(): void
    {
        Queue::fake();
        $user = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($user);

        $this->refine($user, $plan, ['notes' => str_repeat('a', 281)])->assertStatus(422);
    }

    public function test_refining_beyond_the_allowance_is_rejected(): void
    {
        Queue::fake();
        config(['subscriptions.tiers.starter.monthly_generations' => 0]);
        $user = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($user);

        $this->refine($user, $plan)->assertStatus(429);
        Queue::assertNotPushed(GeneratePlanSteps::class);
    }

    public function test_a_second_refine_call_while_the_first_is_in_flight_is_rejected(): void
    {
        Queue::fake();
        $user = $this->makeSubscribedUser();
        $plan = $this->makeReadyPlan($user);

        $this->refine($user, $plan)->assertStatus(202);
        $this->refine($user, $plan)->assertStatus(422);

        $this->assertSame(1, PlanRefinement::where('plan_id', $plan->id)->count());
        Queue::assertPushed(GeneratePlanSteps::class, 1);
    }
}
