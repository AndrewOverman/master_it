<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\PlanFeedback;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PlanFeedbackTest extends TestCase
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

    private function submitFeedback(User $user, Plan $plan, array $payload): TestResponse
    {
        return $this->actingAs($user)->postJson("/api/v1/plans/{$plan->id}/feedback", $payload);
    }

    public function test_owner_can_submit_a_rating_and_tags(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlan($user);

        $response = $this->submitFeedback($user, $plan, ['rating' => 5, 'tags' => ['well_paced', 'clear_steps']]);

        $response->assertStatus(201);
        $feedback = PlanFeedback::where('plan_id', $plan->id)->sole();
        $this->assertSame(5, $feedback->rating);
        $this->assertSame(['well_paced', 'clear_steps'], $feedback->tags);
    }

    public function test_owner_can_submit_just_a_rating(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlan($user);

        $this->submitFeedback($user, $plan, ['rating' => 3])->assertStatus(201);
        $this->assertSame(1, PlanFeedback::where('plan_id', $plan->id)->count());
    }

    public function test_owner_can_submit_just_tags(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlan($user);

        $this->submitFeedback($user, $plan, ['tags' => ['too_vague']])->assertStatus(201);
        $this->assertSame(1, PlanFeedback::where('plan_id', $plan->id)->count());
    }

    public function test_non_owner_cannot_submit_feedback(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $plan = $this->makeReadyPlan($owner);

        $this->submitFeedback($intruder, $plan, ['rating' => 4])->assertStatus(404);
        $this->assertSame(0, PlanFeedback::where('plan_id', $plan->id)->count());
    }

    public function test_feedback_requires_a_rating_or_a_tag(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlan($user);

        $this->submitFeedback($user, $plan, [])->assertStatus(422);
    }

    public function test_rating_out_of_range_is_rejected(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlan($user);

        $this->submitFeedback($user, $plan, ['rating' => 6])->assertStatus(422);
        $this->submitFeedback($user, $plan, ['rating' => 0])->assertStatus(422);
    }

    public function test_invalid_tag_is_rejected(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlan($user);

        $this->submitFeedback($user, $plan, ['tags' => ['not_a_real_tag']])->assertStatus(422);
    }

    public function test_resubmitting_feedback_replaces_the_previous_review(): void
    {
        $user = User::factory()->create();
        $plan = $this->makeReadyPlan($user);

        $this->submitFeedback($user, $plan, ['rating' => 2, 'tags' => ['too_hard']]);
        $this->submitFeedback($user, $plan, ['rating' => 5, 'tags' => ['well_paced']]);

        $feedback = PlanFeedback::where('plan_id', $plan->id)->sole();
        $this->assertSame(5, $feedback->rating);
        $this->assertSame(['well_paced'], $feedback->tags);
    }

    /**
     * Each plan's review is scoped to that plan — replacing one plan's review
     * must not touch another's, even for the same user.
     */
    public function test_reviews_for_different_plans_are_kept_separately(): void
    {
        $user = User::factory()->create();
        $first = $this->makeReadyPlan($user);
        $second = $this->makeReadyPlan($user);

        $this->submitFeedback($user, $first, ['rating' => 2]);
        $this->submitFeedback($user, $second, ['rating' => 4]);

        $this->assertSame(2, PlanFeedback::where('plan_id', $first->id)->sole()->rating);
        $this->assertSame(4, PlanFeedback::where('plan_id', $second->id)->sole()->rating);
    }
}
