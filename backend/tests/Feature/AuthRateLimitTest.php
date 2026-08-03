<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AuthRateLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_is_rate_limited_after_five_attempts(): void
    {
        User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => Hash::make('correct-password'),
        ]);

        for ($i = 1; $i <= 5; $i++) {
            $response = $this->postJson('/api/v1/login', [
                'email' => 'existing@example.com',
                'password' => 'wrong-password',
            ]);

            $response->assertStatus(422);
        }

        $response = $this->postJson('/api/v1/login', [
            'email' => 'existing@example.com',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(429);
    }

    public function test_register_is_rate_limited_after_five_attempts(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $response = $this->postJson('/api/v1/register', [
                'name' => 'New User',
                'email' => "new-user-{$i}@example.com",
                'password' => 'password123',
            ]);

            $response->assertStatus(201);
        }

        $response = $this->postJson('/api/v1/register', [
            'name' => 'New User',
            'email' => 'new-user-6@example.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(429);
    }

    public function test_token_is_rejected_once_it_expires(): void
    {
        config(['sanctum.expiration' => 10]);

        $user = User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => Hash::make('correct-password'),
        ]);

        $token = $user->createToken('mobile')->plainTextToken;

        // Backdate the token past the expiration window rather than issuing
        // a second request after time-traveling: RequestGuard caches the
        // resolved user on the guard instance shared across sequential test
        // requests, so a prior successful call would mask the expiry check.
        PersonalAccessToken::query()->update([
            'created_at' => now()->subMinutes(11),
        ]);

        $this->withToken($token)->getJson('/api/v1/user')->assertUnauthorized();
    }
}
