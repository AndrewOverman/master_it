<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SubscriptionRefreshTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.revenuecat.secret_api_key' => 'test-secret-key']);
    }

    private function fakeSubscriber(array $entitlements, array $subscriptions = []): void
    {
        Http::fake([
            'api.revenuecat.com/*' => Http::response([
                'subscriber' => [
                    'entitlements' => $entitlements,
                    'subscriptions' => $subscriptions,
                ],
            ]),
        ]);
    }

    public function test_requires_authentication(): void
    {
        $this->postJson('/api/v1/user/subscription/refresh')->assertStatus(401);
    }

    public function test_grants_the_tier_revenuecat_reports(): void
    {
        Carbon::setTestNow('2026-01-01 00:00:00');
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $this->fakeSubscriber(
            ['pro' => ['expires_date' => '2026-02-01T00:00:00Z']],
            ['masterit_pro_monthly' => ['store' => 'app_store']],
        );

        $response = $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh');

        $response->assertOk()->assertJsonPath('subscription_tier', 'pro');

        $user->refresh();
        $this->assertSame('pro', $user->subscription_tier);
        $this->assertSame('ios', $user->subscription_platform);
        $this->assertTrue($user->subscription_expires_at->equalTo(Carbon::parse('2026-02-01 00:00:00')));
        $this->assertTrue($user->hasActiveSubscription());
    }

    public function test_the_advertised_limit_becomes_the_enforced_limit(): void
    {
        Carbon::setTestNow('2026-01-01 00:00:00');
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $this->fakeSubscriber(['starter' => ['expires_date' => '2026-02-01T00:00:00Z']]);

        $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh')
            ->assertOk()
            ->assertJsonPath('generations_limit', config('subscriptions.tiers.starter.monthly_generations'))
            ->assertJsonPath('can_generate', true);
    }

    public function test_pro_wins_when_both_entitlements_are_held(): void
    {
        Carbon::setTestNow('2026-01-01 00:00:00');
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $this->fakeSubscriber([
            'starter' => ['expires_date' => '2026-02-01T00:00:00Z'],
            'pro' => ['expires_date' => '2026-02-01T00:00:00Z'],
        ]);

        $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh')->assertOk();

        $this->assertSame('pro', $user->fresh()->subscription_tier);
    }

    public function test_an_expired_entitlement_downgrades_to_free(): void
    {
        Carbon::setTestNow('2026-03-01 00:00:00');
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => Carbon::parse('2026-02-01 00:00:00'),
        ]);

        $this->fakeSubscriber(['pro' => ['expires_date' => '2026-02-01T00:00:00Z']]);

        $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh')->assertOk();

        $this->assertSame('free', $user->fresh()->subscription_tier);
    }

    public function test_a_lifetime_entitlement_has_no_expiry_and_stays_active(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $this->fakeSubscriber(['pro' => ['expires_date' => null]]);

        $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh')->assertOk();

        $user->refresh();
        $this->assertSame('pro', $user->subscription_tier);
        $this->assertNull($user->subscription_expires_at);
    }

    /**
     * The endpoint takes no body by design — entitlements come from
     * RevenueCat, never from the caller. Without this, the refresh endpoint
     * would be a way to grant yourself a paid tier for free.
     */
    public function test_a_client_supplied_tier_is_ignored(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $this->fakeSubscriber([]);

        $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh', [
            'subscription_tier' => 'pro',
            'entitlement_ids' => ['pro'],
        ])->assertOk();

        $this->assertSame('free', $user->fresh()->subscription_tier);
    }

    public function test_an_unknown_subscriber_leaves_the_user_untouched(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'pro']);

        Http::fake(['api.revenuecat.com/*' => Http::response([], 404)]);

        $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh')->assertOk();

        // Not downgraded: RevenueCat having no record of this ID is the
        // normal state for someone who has never opened the paywall, and
        // must not strip a tier the webhook legitimately granted.
        $this->assertSame('pro', $user->fresh()->subscription_tier);
    }

    public function test_a_revenuecat_outage_leaves_the_user_untouched(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'pro']);

        Http::fake(['api.revenuecat.com/*' => Http::response([], 500)]);

        $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh')
            ->assertOk()
            ->assertJsonPath('subscription_tier', 'pro');

        $this->assertSame('pro', $user->fresh()->subscription_tier);
    }

    public function test_is_a_no_op_when_no_secret_key_is_configured(): void
    {
        config(['services.revenuecat.secret_api_key' => null]);
        Http::fake();

        $user = User::factory()->create(['subscription_tier' => 'free']);

        $this->actingAs($user)->postJson('/api/v1/user/subscription/refresh')->assertOk();

        Http::assertNothingSent();
    }

    public function test_tiers_endpoint_serves_the_enforced_limits(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/v1/subscriptions/tiers')
            ->assertOk()
            ->assertJsonPath('data.1.id', 'starter')
            ->assertJsonPath('data.1.monthly_generations', 10)
            ->assertJsonPath('data.2.id', 'pro')
            ->assertJsonPath('data.2.monthly_generations', 25);
    }
}
