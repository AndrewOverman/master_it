<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_gives_the_same_response_for_a_known_and_unknown_email(): void
    {
        User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => Hash::make('correct-password'),
        ]);

        $known = $this->postJson('/api/v1/forgot-password', ['email' => 'existing@example.com']);
        $unknown = $this->postJson('/api/v1/forgot-password', ['email' => 'nobody@example.com']);

        $known->assertOk();
        $unknown->assertOk();
        $this->assertSame($known->json('message'), $unknown->json('message'));
    }

    public function test_forgot_password_deep_links_into_the_mobile_app(): void
    {
        Notification::fake();

        $user = User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => Hash::make('correct-password'),
        ]);

        $this->postJson('/api/v1/forgot-password', ['email' => 'existing@example.com'])->assertOk();

        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use ($user) {
            $mail = $notification->toMail($user);

            return str_starts_with($mail->actionUrl, 'masterit://reset-password?token=')
                && str_contains($mail->actionUrl, 'email=existing%40example.com');
        });
    }

    public function test_reset_password_updates_the_password_and_revokes_existing_tokens(): void
    {
        $user = User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => Hash::make('old-password'),
        ]);
        $user->createToken('mobile');

        $token = Password::createToken($user);

        $response = $this->postJson('/api/v1/reset-password', [
            'email' => 'existing@example.com',
            'token' => $token,
            'password' => 'NewPass9x2Zebra',
        ]);

        $response->assertOk();
        $this->assertTrue(Hash::check('NewPass9x2Zebra', $user->fresh()->password));
        $this->assertSame(0, PersonalAccessToken::where('tokenable_id', $user->id)->count());
    }

    public function test_reset_password_rejects_an_invalid_token_without_revealing_why(): void
    {
        User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => Hash::make('old-password'),
        ]);

        $badToken = $this->postJson('/api/v1/reset-password', [
            'email' => 'existing@example.com',
            'token' => 'not-a-real-token',
            'password' => 'NewPass9x2Zebra',
        ]);

        $unknownEmail = $this->postJson('/api/v1/reset-password', [
            'email' => 'nobody@example.com',
            'token' => 'not-a-real-token',
            'password' => 'NewPass9x2Zebra',
        ]);

        $badToken->assertStatus(422);
        $unknownEmail->assertStatus(422);
        $this->assertSame(
            $badToken->json('errors.email.0'),
            $unknownEmail->json('errors.email.0')
        );
    }

    public function test_reset_password_token_is_single_use(): void
    {
        $user = User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => Hash::make('old-password'),
        ]);

        $token = Password::createToken($user);

        $this->postJson('/api/v1/reset-password', [
            'email' => 'existing@example.com',
            'token' => $token,
            'password' => 'NewPass9x2Zebra',
        ])->assertOk();

        $this->postJson('/api/v1/reset-password', [
            'email' => 'existing@example.com',
            'token' => $token,
            'password' => 'AnotherPass8y3Lion',
        ])->assertStatus(422);
    }

    public function test_forgot_password_is_rate_limited_after_five_attempts(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/v1/forgot-password', ['email' => "someone-{$i}@example.com"])
                ->assertOk();
        }

        $this->postJson('/api/v1/forgot-password', ['email' => 'someone-6@example.com'])
            ->assertStatus(429);
    }
}
