<?php

namespace Tests\Feature;

use App\Models\PushToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushTokenRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

    public function test_a_device_can_register(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/v1/push-tokens', [
                'token' => self::TOKEN,
                'platform' => 'ios',
                'timezone' => 'America/Detroit',
            ])
            ->assertNoContent();

        $this->assertDatabaseHas('push_tokens', [
            'user_id' => $user->id,
            'token' => self::TOKEN,
            'platform' => 'ios',
            'timezone' => 'America/Detroit',
        ]);
    }

    /**
     * The app re-registers on every launch, so this is the common case,
     * not an edge one — it must refresh the row rather than accumulate
     * duplicates that would each get their own copy of every push.
     */
    public function test_re_registering_updates_the_existing_row(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/v1/push-tokens', [
            'token' => self::TOKEN,
            'platform' => 'ios',
            'timezone' => 'America/Detroit',
        ]);

        $this->actingAs($user)->postJson('/api/v1/push-tokens', [
            'token' => self::TOKEN,
            'platform' => 'ios',
            'timezone' => 'Europe/Berlin',
        ])->assertNoContent();

        $this->assertDatabaseCount('push_tokens', 1);
        $this->assertDatabaseHas('push_tokens', ['timezone' => 'Europe/Berlin']);
    }

    /**
     * A phone that changes hands has to move with it, or the previous
     * account keeps receiving notifications on a device it no longer has.
     */
    public function test_registering_a_token_held_by_another_account_reassigns_it(): void
    {
        $first = User::factory()->create();
        $second = User::factory()->create();

        $this->actingAs($first)->postJson('/api/v1/push-tokens', [
            'token' => self::TOKEN,
            'platform' => 'ios',
        ]);

        $this->actingAs($second)->postJson('/api/v1/push-tokens', [
            'token' => self::TOKEN,
            'platform' => 'ios',
        ])->assertNoContent();

        $this->assertDatabaseCount('push_tokens', 1);
        $this->assertDatabaseHas('push_tokens', ['token' => self::TOKEN, 'user_id' => $second->id]);
    }

    public function test_timezone_defaults_to_utc_when_omitted(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/v1/push-tokens', ['token' => self::TOKEN, 'platform' => 'android'])
            ->assertNoContent();

        $this->assertDatabaseHas('push_tokens', ['token' => self::TOKEN, 'timezone' => 'UTC']);
    }

    /**
     * A junk timezone would poison every local-hour calculation for this
     * user — quiet hours, the nudge hour, and which steps count as due
     * today all read it.
     */
    public function test_an_invalid_timezone_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/v1/push-tokens', [
                'token' => self::TOKEN,
                'platform' => 'ios',
                'timezone' => 'Mars/Olympus_Mons',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('timezone');
    }

    public function test_an_invalid_platform_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/v1/push-tokens', ['token' => self::TOKEN, 'platform' => 'windows'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('platform');
    }

    public function test_registering_requires_authentication(): void
    {
        $this->postJson('/api/v1/push-tokens', ['token' => self::TOKEN, 'platform' => 'ios'])
            ->assertStatus(401);
    }

    public function test_a_device_can_unregister(): void
    {
        $user = User::factory()->create();
        PushToken::create(['user_id' => $user->id, 'token' => self::TOKEN, 'platform' => 'ios']);

        $this->actingAs($user)
            ->deleteJson('/api/v1/push-tokens', ['token' => self::TOKEN])
            ->assertNoContent();

        $this->assertDatabaseMissing('push_tokens', ['token' => self::TOKEN]);
    }

    /**
     * An Expo token isn't a secret the way a session token is, so without
     * the ownership scope anyone holding one could silence someone else's
     * notifications.
     */
    public function test_a_user_cannot_unregister_someone_elses_device(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        PushToken::create(['user_id' => $owner->id, 'token' => self::TOKEN, 'platform' => 'ios']);

        $this->actingAs($intruder)
            ->deleteJson('/api/v1/push-tokens', ['token' => self::TOKEN])
            ->assertNoContent();

        $this->assertDatabaseHas('push_tokens', ['token' => self::TOKEN]);
    }

    public function test_deleting_a_user_removes_their_devices(): void
    {
        $user = User::factory()->create(['password' => bcrypt('Password123')]);
        PushToken::create(['user_id' => $user->id, 'token' => self::TOKEN, 'platform' => 'ios']);

        $this->actingAs($user)
            ->deleteJson('/api/v1/user', ['password' => 'Password123'])
            ->assertNoContent();

        $this->assertDatabaseMissing('push_tokens', ['token' => self::TOKEN]);
    }
}
