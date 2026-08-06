<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SharedPlanRedirectTest extends TestCase
{
    use RefreshDatabase;

    // Mirrors PlanSharingTest's helper: share_token/share_token_expires_at
    // are deliberately excluded from $fillable, so seeding them in a test
    // has to bypass mass assignment.
    private function makePlan(User $user, array $overrides = []): Plan
    {
        $forced = array_intersect_key($overrides, array_flip(['share_token', 'share_token_expires_at']));
        $overrides = array_diff_key($overrides, $forced);

        $plan = Plan::create(array_merge([
            'user_id' => $user->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
        ], $overrides));

        if ($forced !== []) {
            $plan->forceFill($forced)->save();
        }

        return $plan;
    }

    public function test_valid_token_renders_the_redirect_page(): void
    {
        $owner = User::factory()->create();
        $plan = $this->makePlan($owner, ['share_token' => 'abc123']);

        $response = $this->get('/plans/shared/abc123');

        $response->assertOk();
        $response->assertSee('masterit://plans/shared/abc123', false);
        $response->assertDontSee('Learn Something');
    }

    public function test_unknown_token_shows_the_unavailable_page(): void
    {
        $response = $this->get('/plans/shared/does-not-exist');

        $response->assertStatus(404);
        $response->assertSee('no longer available');
        $response->assertDontSee('masterit://', false);
    }

    public function test_expired_token_shows_the_unavailable_page(): void
    {
        $owner = User::factory()->create();
        $this->makePlan($owner, [
            'share_token' => 'expired-token',
            'share_token_expires_at' => now()->subMinute(),
        ]);

        $response = $this->get('/plans/shared/expired-token');

        $response->assertStatus(404);
        $response->assertSee('no longer available');
    }

    public function test_not_ready_plan_shows_the_unavailable_page(): void
    {
        $owner = User::factory()->create();
        $this->makePlan($owner, ['share_token' => 'stale-token', 'status' => 'failed']);

        $response = $this->get('/plans/shared/stale-token');

        $response->assertStatus(404);
        $response->assertSee('no longer available');
    }

    public function test_a_token_with_no_expiry_set_still_works(): void
    {
        $owner = User::factory()->create();
        $this->makePlan($owner, ['share_token' => 'legacy-token']);

        $response = $this->get('/plans/shared/legacy-token');

        $response->assertOk();
        $response->assertSee('masterit://plans/shared/legacy-token', false);
    }
}
