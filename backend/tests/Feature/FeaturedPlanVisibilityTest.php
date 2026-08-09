<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FeaturedPlanVisibilityTest extends TestCase
{
    use RefreshDatabase;

    /**
     * `is_featured` is deliberately absent from Plan::$fillable — it's an
     * editorial flag, not something a request may set — so it has to be
     * assigned directly rather than passed to create().
     */
    private function makePlan(User $owner, bool $featured = false, string $status = 'ready'): Plan
    {
        $plan = Plan::create([
            'user_id' => $owner->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => $status,
        ]);

        if ($featured) {
            $plan->is_featured = true;
            $plan->save();
        }

        $plan->steps()->create([
            'order' => 1,
            'title' => 'Step one',
            'description' => 'Do the thing.',
            'estimated_days' => 3,
        ]);

        return $plan->refresh();
    }

    public function test_anyone_can_view_a_featured_plan(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $plan = $this->makePlan($owner, featured: true);

        $response = $this->actingAs($viewer)->getJson("/api/v1/plans/{$plan->id}");

        $response->assertOk()
            ->assertJsonPath('id', $plan->id)
            ->assertJsonCount(1, 'steps');
    }

    /**
     * The share token is the one thing a non-owner must never see, since it
     * would let them mint a link to someone else's plan.
     */
    public function test_a_featured_plan_does_not_leak_owner_only_fields(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $plan = $this->makePlan($owner, featured: true);
        $plan->shareToken();

        $response = $this->actingAs($viewer)->getJson("/api/v1/plans/{$plan->id}");

        $response->assertOk()
            ->assertJsonMissingPath('share_token')
            ->assertJsonMissingPath('share_token_expires_at');
    }

    public function test_the_owner_still_sees_owner_only_fields(): void
    {
        $owner = User::factory()->create();
        $plan = $this->makePlan($owner, featured: true);
        $plan->shareToken();

        $this->actingAs($owner)
            ->getJson("/api/v1/plans/{$plan->id}")
            ->assertOk()
            ->assertJsonPath('share_token', $plan->fresh()->share_token);
    }

    public function test_a_non_featured_plan_stays_private(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $plan = $this->makePlan($owner);

        $this->actingAs($viewer)->getJson("/api/v1/plans/{$plan->id}")->assertStatus(404);
    }

    /**
     * A featured plan mid-generation has nothing worth previewing, and
     * showcasing a half-built one would be worse than hiding it.
     */
    public function test_a_featured_plan_that_is_not_ready_stays_private(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $plan = $this->makePlan($owner, featured: true, status: 'generating');

        $this->actingAs($viewer)->getJson("/api/v1/plans/{$plan->id}")->assertStatus(404);
    }
}
