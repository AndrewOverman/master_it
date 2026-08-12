<?php

namespace Tests\Feature;

use App\Models\PushToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The billing-failure notification, and the reason it fires on the status
 * *transition* rather than on the payload: RevenueCat retries any webhook
 * it doesn't get a 2xx for, and re-delivers the same event.
 */
class SubscriptionNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.revenuecat.webhook_secret' => 'test-secret']);

        // A payment issue is an Account-category message, so it's subject to
        // quiet hours — without a fixed clock these tests only pass when the
        // suite happens to run during the day in UTC. Devices below are all
        // UTC, so this is mid-morning for every user in this file.
        Carbon::setTestNow('2026-08-10 12:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function userWithDevice(array $attributes = []): User
    {
        $user = User::factory()->create($attributes);

        PushToken::create([
            'user_id' => $user->id,
            'token' => 'tok-'.$user->id,
            'platform' => 'ios',
            'timezone' => 'UTC',
            'last_seen_at' => now(),
        ]);

        return $user;
    }

    private function postWebhook(User $user, string $type, array $overrides = [])
    {
        return $this->withHeader('Authorization', 'test-secret')
            ->postJson('/api/v1/webhooks/revenuecat', [
                'event' => array_merge([
                    'type' => $type,
                    'app_user_id' => (string) $user->id,
                    'entitlement_ids' => ['pro'],
                    'store' => 'app_store',
                    'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
                ], $overrides),
            ]);
    }

    public function test_a_billing_issue_notifies_the_user(): void
    {
        $user = $this->userWithDevice(['subscription_tier' => 'pro', 'subscription_status' => 'active']);

        $this->postWebhook($user, 'BILLING_ISSUE')->assertSuccessful();

        $this->assertSame('past_due', $user->fresh()->subscription_status);
        $this->assertDatabaseHas('notification_deliveries', [
            'user_id' => $user->id,
            'type' => 'payment_issue',
        ]);
    }

    /**
     * The regression this whole design exists to prevent: RevenueCat
     * re-delivering the same BILLING_ISSUE must not notify twice.
     */
    public function test_a_redelivered_billing_issue_does_not_notify_again(): void
    {
        $user = $this->userWithDevice(['subscription_tier' => 'pro', 'subscription_status' => 'active']);

        $this->postWebhook($user, 'BILLING_ISSUE');
        $this->postWebhook($user, 'BILLING_ISSUE');

        $this->assertDatabaseCount('notification_deliveries', 1);
    }

    public function test_a_renewal_does_not_notify(): void
    {
        $user = $this->userWithDevice(['subscription_tier' => 'pro', 'subscription_status' => 'active']);

        $this->postWebhook($user, 'RENEWAL')->assertSuccessful();

        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    /**
     * An expiry or cancellation is not a payment failure — there's nothing
     * for the user to fix, and the scheduled "ending soon" notice already
     * covers the part they can act on.
     */
    public function test_an_expiration_does_not_send_a_payment_issue(): void
    {
        $user = $this->userWithDevice(['subscription_tier' => 'pro', 'subscription_status' => 'active']);

        $this->postWebhook($user, 'EXPIRATION', ['entitlement_ids' => []])->assertSuccessful();

        $this->assertDatabaseMissing('notification_deliveries', ['type' => 'payment_issue']);
    }

    /**
     * Payment issues are an Account-category message, so the switch has to
     * hold here too.
     */
    public function test_a_user_who_switched_off_account_notices_gets_nothing(): void
    {
        $user = $this->userWithDevice([
            'subscription_tier' => 'pro',
            'subscription_status' => 'active',
            'notify_account' => false,
        ]);

        $this->postWebhook($user, 'BILLING_ISSUE')->assertSuccessful();

        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    /**
     * Most accounts have no registered device. The webhook still has to
     * apply the subscription change and return 2xx — erroring here would
     * make RevenueCat retry a payload that was actually processed fine.
     */
    public function test_a_billing_issue_on_an_account_with_no_device_still_succeeds(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'pro', 'subscription_status' => 'active']);

        $this->postWebhook($user, 'BILLING_ISSUE')->assertSuccessful();

        // Nothing to deliver to, so nothing is recorded — but the webhook
        // itself must still succeed rather than error on the missing device.
        $this->assertDatabaseCount('notification_deliveries', 0);
        $this->assertSame('past_due', $user->fresh()->subscription_status);
    }
}
