<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationPreferencesTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Every category starts on. The OS permission prompt is already the
     * opt-in — someone who deliberately allowed notifications and then
     * received none would have no way to tell why.
     */
    public function test_all_categories_default_to_on(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/v1/user')
            ->assertOk()
            ->assertJson([
                'notification_preferences' => [
                    'plan_updates' => true,
                    'reminders' => true,
                    'progress' => true,
                    'account' => true,
                ],
                'daily_nudge_hour' => 9,
            ]);
    }

    public function test_a_category_can_be_switched_off(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patchJson('/api/v1/user', ['notify_reminders' => false])
            ->assertOk()
            ->assertJson(['notification_preferences' => ['reminders' => false]]);

        $this->assertFalse($user->fresh()->notify_reminders);
    }

    /**
     * The response is the same shape as GET /user because the client
     * writes it straight into its shared user cache — returning anything
     * narrower would blank out the fields other screens read.
     */
    public function test_the_patch_response_carries_the_full_user_shape(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patchJson('/api/v1/user', ['notify_progress' => false])
            ->assertOk()
            ->assertJsonStructure([
                'id', 'name', 'email', 'email_verified',
                'subscription_tier', 'can_generate', 'generations_remaining',
                'notification_preferences' => ['plan_updates', 'reminders', 'progress', 'account'],
                'daily_nudge_hour',
            ]);
    }

    public function test_the_nudge_hour_can_be_changed(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patchJson('/api/v1/user', ['daily_nudge_hour' => 18])
            ->assertOk()
            ->assertJson(['daily_nudge_hour' => 18]);

        $this->assertSame(18, $user->fresh()->daily_nudge_hour);
    }

    public function test_a_nudge_hour_outside_the_day_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->patchJson('/api/v1/user', ['daily_nudge_hour' => 24])
            ->assertStatus(422)
            ->assertJsonValidationErrors('daily_nudge_hour');
    }

    public function test_updating_preferences_leaves_the_profile_alone(): void
    {
        $user = User::factory()->create(['name' => 'Original Name']);

        $this->actingAs($user)->patchJson('/api/v1/user', ['notify_account' => false]);

        $this->assertSame('Original Name', $user->fresh()->name);
    }

    /**
     * Preferences are the user's to set; the subscription columns are the
     * app's word. Sharing one endpoint must not make the latter writable.
     */
    public function test_subscription_fields_are_still_not_mass_assignable(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->patchJson('/api/v1/user', [
            'notify_reminders' => false,
            'subscription_tier' => 'pro',
        ]);

        $this->assertSame('free', $user->fresh()->subscription_tier);
    }
}
