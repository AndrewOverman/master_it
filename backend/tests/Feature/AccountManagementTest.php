<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccountManagementTest extends TestCase
{
    use RefreshDatabase;

    private function makeUserWithPlan(string $password = 'correct-password'): User
    {
        $user = User::create([
            'name' => 'Existing User',
            'email' => 'existing@example.com',
            'password' => Hash::make($password),
        ]);

        $plan = Plan::create([
            'user_id' => $user->id,
            'title' => 'Learn Something',
            'original_prompt' => 'Learn something',
            'status' => 'ready',
        ]);

        $plan->steps()->create([
            'order' => 1,
            'title' => 'Step One',
            'description' => 'Do the first thing.',
            'estimated_days' => 3,
        ]);

        return $user;
    }

    public function test_user_can_export_their_plans_and_steps(): void
    {
        $user = $this->makeUserWithPlan();
        $token = $user->createToken('mobile')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/user/export');

        $response->assertOk();
        $response->assertJsonPath('user.email', 'existing@example.com');
        $response->assertJsonPath('plans.0.title', 'Learn Something');
        $response->assertJsonPath('plans.0.steps.0.title', 'Step One');
    }

    public function test_user_can_delete_their_account_with_correct_password(): void
    {
        $user = $this->makeUserWithPlan();
        $planId = $user->plans()->first()->id;
        $token = $user->createToken('mobile')->plainTextToken;

        $response = $this->withToken($token)->deleteJson('/api/v1/user', [
            'password' => 'correct-password',
        ]);

        $response->assertNoContent();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('plans', ['id' => $planId]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_a_deleted_users_token_no_longer_authenticates(): void
    {
        $user = $this->makeUserWithPlan();
        $token = $user->createToken('mobile')->plainTextToken;

        // Delete directly rather than via the HTTP endpoint: a prior
        // authenticated request in this same test would get cached on the
        // RequestGuard instance and mask the check below (same reason
        // AuthRateLimitTest's expiration test backdates instead of
        // replaying a request).
        $user->tokens()->delete();
        $user->delete();

        $this->withToken($token)->getJson('/api/v1/user')->assertUnauthorized();
    }

    public function test_account_deletion_requires_the_correct_password(): void
    {
        $user = $this->makeUserWithPlan();
        $token = $user->createToken('mobile')->plainTextToken;

        $response = $this->withToken($token)->deleteJson('/api/v1/user', [
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }
}
