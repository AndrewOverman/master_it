<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class RevenueCatWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.revenuecat.webhook_secret' => 'test-secret']);
    }

    private function postWebhook(array $event, ?string $secret = 'test-secret')
    {
        $headers = $secret ? ['Authorization' => $secret] : [];

        return $this->withHeaders($headers)->postJson('/api/v1/webhooks/revenuecat', ['event' => $event]);
    }

    public function test_rejects_requests_without_the_configured_secret(): void
    {
        $user = User::factory()->create();

        $this->postWebhook([
            'type' => 'INITIAL_PURCHASE',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => ['pro'],
        ], secret: null)->assertStatus(401);

        $this->postWebhook([
            'type' => 'INITIAL_PURCHASE',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => ['pro'],
        ], secret: 'wrong-secret')->assertStatus(401);

        $this->assertSame('free', $user->fresh()->subscription_tier);
    }

    public function test_unknown_app_user_id_is_acknowledged_but_ignored(): void
    {
        $this->postWebhook([
            'type' => 'INITIAL_PURCHASE',
            'app_user_id' => '999999',
            'entitlement_ids' => ['pro'],
        ])->assertNoContent();
    }

    public function test_initial_purchase_grants_the_matching_tier_and_expiry(): void
    {
        Carbon::setTestNow('2026-01-01 00:00:00');
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $expiresAt = Carbon::parse('2026-02-01 00:00:00');

        $this->postWebhook([
            'type' => 'INITIAL_PURCHASE',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => ['starter'],
            'expiration_at_ms' => $expiresAt->getTimestampMs(),
            'store' => 'app_store',
        ])->assertNoContent();

        $fresh = $user->fresh();
        $this->assertSame('starter', $fresh->subscription_tier);
        $this->assertSame('active', $fresh->subscription_status);
        $this->assertSame('ios', $fresh->subscription_platform);
        $this->assertTrue($fresh->subscription_expires_at->equalTo($expiresAt));
        $this->assertTrue($fresh->hasActiveSubscription());

        Carbon::setTestNow();
    }

    public function test_expiration_event_downgrades_the_user_to_free(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_status' => 'active',
            'subscription_expires_at' => now()->addDay(),
        ]);

        $this->postWebhook([
            'type' => 'EXPIRATION',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => [],
        ])->assertNoContent();

        $fresh = $user->fresh();
        $this->assertSame('free', $fresh->subscription_tier);
        $this->assertSame('expired', $fresh->subscription_status);
        $this->assertFalse($fresh->hasActiveSubscription());
    }

    public function test_pro_entitlement_wins_over_starter_when_both_present(): void
    {
        $user = User::factory()->create();

        $this->postWebhook([
            'type' => 'PRODUCT_CHANGE',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => ['starter', 'pro'],
            'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
        ])->assertNoContent();

        $this->assertSame('pro', $user->fresh()->subscription_tier);
    }

    public function test_cancellation_keeps_access_until_expiry(): void
    {
        // A CANCELLATION event means auto-renew was turned off, not that
        // access ended — entitlement_ids and expiration_at_ms still reflect
        // the still-active subscription.
        $user = User::factory()->create();
        $expiresAt = now()->addDays(10);

        $this->postWebhook([
            'type' => 'CANCELLATION',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => ['starter'],
            'expiration_at_ms' => $expiresAt->getTimestampMs(),
        ])->assertNoContent();

        $fresh = $user->fresh();
        $this->assertSame('starter', $fresh->subscription_tier);
        $this->assertSame('canceled', $fresh->subscription_status);
        $this->assertTrue($fresh->hasActiveSubscription());
    }

    /**
     * A paid event with no expiration_at_ms must not clear the stored expiry:
     * null on a paid tier reads as a lifetime entitlement downstream, so
     * doing so would grant permanent access on the strength of a missing
     * field.
     */
    public function test_a_paid_event_without_an_expiry_keeps_the_stored_one(): void
    {
        $expiresAt = now()->addDays(20)->startOfSecond();
        $user = User::factory()->create([
            'subscription_tier' => 'starter',
            'subscription_expires_at' => $expiresAt,
        ]);

        $this->postWebhook([
            'type' => 'PRODUCT_CHANGE',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => ['pro'],
        ])->assertNoContent();

        $fresh = $user->fresh();
        $this->assertSame('pro', $fresh->subscription_tier);
        $this->assertTrue($fresh->subscription_expires_at->equalTo($expiresAt));
    }

    /**
     * The counterpart: when the event resolves to the free tier, a null
     * expiry is meaningful rather than absent, and must be written.
     */
    public function test_an_expiration_event_clears_the_stored_expiry(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->addDays(5),
        ]);

        $this->postWebhook([
            'type' => 'EXPIRATION',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => [],
        ])->assertNoContent();

        $fresh = $user->fresh();
        $this->assertSame('free', $fresh->subscription_tier);
        $this->assertNull($fresh->subscription_expires_at);
    }

    /**
     * The case the old code got wrong: RevenueCat sends EXPIRATION events
     * carrying the entitlement that expired, not an empty list. The stored
     * (now past) expiry is what makes this safe — the tier column still says
     * 'pro', but User::effectiveTier() reads the date and returns 'free'.
     */
    public function test_an_expiration_event_that_still_lists_the_entitlement_does_not_extend_access(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->subDay(),
        ]);

        $this->postWebhook([
            'type' => 'EXPIRATION',
            'app_user_id' => (string) $user->id,
            'entitlement_ids' => ['pro'],
        ])->assertNoContent();

        $fresh = $user->fresh();
        $this->assertFalse($fresh->hasActiveSubscription());
        $this->assertSame('free', $fresh->effectiveTier());
        $this->assertSame(0, $fresh->monthlyGenerationLimit());
    }
}
