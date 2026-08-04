<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PlanSharingTest extends TestCase
{
    use RefreshDatabase;

    private function makePlan(User $user, array $overrides = []): Plan
    {
        // share_token and share_token_expires_at are deliberately excluded
        // from $fillable (they must only ever be set via
        // Plan::shareToken()/revokeShareToken()), so tests that need to
        // seed them have to bypass mass assignment.
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

    public function test_owner_can_mint_a_share_token(): void
    {
        $owner = User::factory()->create();
        $plan = $this->makePlan($owner);

        $response = $this->actingAs($owner)->postJson("/api/v1/plans/{$plan->id}/share");

        $response->assertOk();
        $token = $response->json('share_token');
        $this->assertNotEmpty($token);
        $this->assertSame($token, $plan->fresh()->share_token);
    }

    public function test_sharing_is_idempotent(): void
    {
        $owner = User::factory()->create();
        $plan = $this->makePlan($owner);

        $first = $this->actingAs($owner)->postJson("/api/v1/plans/{$plan->id}/share")->json('share_token');
        $second = $this->actingAs($owner)->postJson("/api/v1/plans/{$plan->id}/share")->json('share_token');

        $this->assertSame($first, $second);
    }

    public function test_sharing_mints_a_token_that_expires_in_30_days(): void
    {
        Carbon::setTestNow('2026-01-01 00:00:00');
        $owner = User::factory()->create();
        $plan = $this->makePlan($owner);

        $this->actingAs($owner)->postJson("/api/v1/plans/{$plan->id}/share")->assertOk();

        $this->assertTrue($plan->fresh()->share_token_expires_at->equalTo(Carbon::parse('2026-01-31 00:00:00')));
        Carbon::setTestNow();
    }

    public function test_resharing_after_expiry_mints_a_fresh_token_and_expiry(): void
    {
        $owner = User::factory()->create();
        $plan = $this->makePlan($owner, [
            'share_token' => 'expired-token',
            'share_token_expires_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($owner)->postJson("/api/v1/plans/{$plan->id}/share");

        $newToken = $response->json('share_token');
        $this->assertNotSame('expired-token', $newToken);
        $this->assertTrue($plan->fresh()->share_token_expires_at->isFuture());
    }

    public function test_non_owner_cannot_share_a_plan(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $plan = $this->makePlan($owner);

        $this->actingAs($intruder)->postJson("/api/v1/plans/{$plan->id}/share")->assertStatus(404);
    }

    public function test_cannot_share_a_plan_that_is_not_ready(): void
    {
        $owner = User::factory()->create();
        $plan = $this->makePlan($owner, ['status' => 'generating']);

        $this->actingAs($owner)->postJson("/api/v1/plans/{$plan->id}/share")->assertStatus(422);
    }

    public function test_owner_can_revoke_a_share_token(): void
    {
        $owner = User::factory()->create();
        $plan = $this->makePlan($owner, ['share_token' => 'existing-token']);

        $this->actingAs($owner)->deleteJson("/api/v1/plans/{$plan->id}/share")->assertNoContent();

        $this->assertNull($plan->fresh()->share_token);
    }

    public function test_non_owner_cannot_revoke_a_share_token(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $plan = $this->makePlan($owner, ['share_token' => 'existing-token']);

        $this->actingAs($intruder)->deleteJson("/api/v1/plans/{$plan->id}/share")->assertStatus(404);

        $this->assertSame('existing-token', $plan->fresh()->share_token);
    }

    public function test_share_token_is_only_visible_to_the_owner(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $plan = $this->makePlan($owner, ['share_token' => 'secret-token']);

        $this->actingAs($owner)->getJson("/api/v1/plans/{$plan->id}")
            ->assertJsonPath('share_token', 'secret-token');

        $this->actingAs($viewer)->getJson("/api/v1/plans/shared/secret-token")
            ->assertJsonMissingPath('share_token');
    }

    public function test_any_authenticated_user_can_view_a_shared_plan(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $plan = $this->makePlan($owner, ['share_token' => 'abc123']);
        $plan->steps()->create(['order' => 1, 'title' => 'Step One', 'description' => 'Do it.']);

        $response = $this->actingAs($viewer)->getJson('/api/v1/plans/shared/abc123');

        $response->assertOk();
        $response->assertJsonPath('title', 'Learn Something');
        $response->assertJsonCount(1, 'steps');
    }

    public function test_unknown_share_token_404s(): void
    {
        $viewer = User::factory()->create();

        $this->actingAs($viewer)->getJson('/api/v1/plans/shared/does-not-exist')->assertStatus(404);
    }

    public function test_expired_share_token_cannot_be_viewed(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $plan = $this->makePlan($owner, [
            'share_token' => 'expired-token',
            'share_token_expires_at' => now()->subMinute(),
        ]);

        $this->actingAs($viewer)->getJson('/api/v1/plans/shared/expired-token')->assertStatus(404);
    }

    public function test_expired_share_token_cannot_be_copied(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create(['max_plans' => 3]);
        $plan = $this->makePlan($owner, [
            'share_token' => 'expired-token',
            'share_token_expires_at' => now()->subMinute(),
        ]);

        $this->actingAs($viewer)->postJson('/api/v1/plans/shared/expired-token/copy')->assertStatus(404);
        $this->assertSame(0, $viewer->plans()->count());
    }

    public function test_a_token_with_no_expiry_set_still_works(): void
    {
        // Defensive: any share_token minted before this feature shipped
        // has a null expires_at — treat that as "doesn't expire" rather
        // than accidentally 404ing every pre-existing share link.
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $plan = $this->makePlan($owner, ['share_token' => 'legacy-token']);

        $this->actingAs($viewer)->getJson('/api/v1/plans/shared/legacy-token')->assertOk();
    }

    public function test_shared_plan_that_is_not_ready_404s(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        // Not reachable via the normal share() flow (which requires ready),
        // but guard the read path directly in case a token survives a
        // status change (e.g. a plan gets reset into a non-ready state).
        $plan = $this->makePlan($owner, ['share_token' => 'stale-token', 'status' => 'failed']);

        $this->actingAs($viewer)->getJson('/api/v1/plans/shared/stale-token')->assertStatus(404);
    }

    public function test_copying_a_shared_plan_clones_it_into_the_viewers_account(): void
    {
        $owner = User::factory()->create();
        // max_plans is set explicitly here: it defaults to 3 at the DB
        // level, but a factory-created model in memory never re-fetches
        // that default, so it'd otherwise read as null and trip the
        // >= comparison in SharedPlanController::copy via PHP's loose
        // null-as-0 comparison.
        $viewer = User::factory()->create(['max_plans' => 3]);
        $plan = $this->makePlan($owner, ['share_token' => 'abc123', 'emoji' => '🎯']);
        $plan->steps()->create([
            'order' => 1,
            'title' => 'Step One',
            'description' => 'Do it.',
            'estimated_days' => 2,
        ]);

        $response = $this->actingAs($viewer)->postJson('/api/v1/plans/shared/abc123/copy');

        // Laravel auto-sets 201 when a JsonResource wraps a freshly
        // created model returned from a POST — same as the existing
        // featured-plan copy() endpoint.
        $response->assertCreated();
        $copyId = $response->json('id');
        $copy = Plan::findOrFail($copyId);

        $this->assertSame($viewer->id, $copy->user_id);
        $this->assertSame($plan->id, $copy->source_plan_id);
        $this->assertSame('Learn Something', $copy->title);
        $this->assertSame('🎯', $copy->emoji);
        $this->assertCount(1, $copy->steps);
        // The copy is independent — it has no share_token of its own.
        $this->assertNull($copy->share_token);
    }

    public function test_copying_a_shared_plan_respects_the_viewers_max_plans_limit(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create(['max_plans' => 1]);
        $viewer->plans()->create([
            'title' => 'Existing Plan',
            'original_prompt' => 'Existing',
            'status' => 'ready',
        ]);
        $plan = $this->makePlan($owner, ['share_token' => 'abc123']);

        $response = $this->actingAs($viewer)->postJson('/api/v1/plans/shared/abc123/copy');

        $response->assertStatus(429);
        $this->assertSame(1, $viewer->plans()->count());
    }

    public function test_cannot_copy_via_a_revoked_or_unknown_share_token(): void
    {
        $viewer = User::factory()->create();

        $this->actingAs($viewer)->postJson('/api/v1/plans/shared/does-not-exist/copy')->assertStatus(404);
    }
}
