<?php

namespace Tests\Feature;

use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PlanGenerationLimitTest extends TestCase
{
    use RefreshDatabase;

    private function generate(User $user): TestResponse
    {
        return $this->actingAs($user)->postJson('/api/v1/plans', [
            'prompt' => 'Learn to bake sourdough bread',
        ]);
    }

    public function test_free_tier_user_gets_exactly_one_lifetime_generation(): void
    {
        Queue::fake();
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $this->generate($user)->assertCreated();
        $this->generate($user)->assertStatus(429);

        Queue::assertPushed(GeneratePlanSteps::class, 1);
        $this->assertNotNull($user->fresh()->free_generation_claimed_at);
    }

    public function test_subscribed_user_gets_their_tiers_monthly_allowance(): void
    {
        Queue::fake();
        config(['subscriptions.tiers.starter.monthly_generations' => 2]);
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_expires_at' => now()->addMonth(),
        ]);

        $this->generate($user)->assertCreated();
        $this->generate($user)->assertCreated();
        $this->generate($user)->assertStatus(429);

        Queue::assertPushed(GeneratePlanSteps::class, 2);
    }

    public function test_monthly_allowance_resets_after_a_month_elapses(): void
    {
        Queue::fake();
        config(['subscriptions.tiers.starter.monthly_generations' => 1]);
        Carbon::setTestNow('2026-01-01 00:00:00');
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_expires_at' => now()->addYear(),
        ]);

        $this->generate($user)->assertCreated();
        $this->generate($user)->assertStatus(429);

        Carbon::setTestNow('2026-02-02 00:00:00');
        $this->generate($user)->assertCreated();

        Carbon::setTestNow();
    }

    public function test_free_allowance_does_not_reset_on_a_monthly_boundary(): void
    {
        // Unlike a paid tier's monthly quota, the free tier's one-time
        // generation must never come back, no matter how much time passes.
        Queue::fake();
        Carbon::setTestNow('2026-01-01 00:00:00');
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $this->generate($user)->assertCreated();

        Carbon::setTestNow('2027-01-01 00:00:00');
        $this->generate($user)->assertStatus(429);

        Carbon::setTestNow();
    }

    public function test_refining_a_plan_consumes_the_same_allowance_as_generating_one(): void
    {
        Queue::fake();
        config(['subscriptions.tiers.starter.monthly_generations' => 1]);
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_expires_at' => now()->addMonth(),
        ]);

        // Exhausts the allowance via a normal generation...
        $this->generate($user)->assertCreated();

        // ...so a refine attempt on a separate, already-ready plan hits the
        // same 429 — refining draws from the same pool, not a second one.
        $plan = Plan::create([
            'user_id' => $user->id,
            'title' => 'Existing Plan',
            'original_prompt' => 'Existing plan',
            'status' => 'ready',
        ]);

        $this->actingAs($user)->postJson("/api/v1/plans/{$plan->id}/refine", ['tags' => ['no_equipment']])
            ->assertStatus(429);

        Queue::assertPushed(GeneratePlanSteps::class, 1);
    }
}
