<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\VerifyEmail;
use Illuminate\Auth\Events\Verified;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    private function verificationUrl(User $user, ?string $email = null): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $user->id,
            'hash' => sha1($email ?? $user->getEmailForVerification()),
        ]);
    }

    public function test_registering_sends_a_verification_email(): void
    {
        Notification::fake();

        $this->postJson('/api/v1/register', [
            'name' => 'New User',
            'email' => 'new@example.com',
            'password' => 'ValidPass9x2Zebra',
        ])->assertCreated();

        $user = User::where('email', 'new@example.com')->firstOrFail();

        $this->assertNull($user->email_verified_at);
        Notification::assertSentTo($user, VerifyEmail::class);
    }

    public function test_a_signed_link_verifies_the_address(): void
    {
        Event::fake();

        $user = User::factory()->unverified()->create();

        $this->get($this->verificationUrl($user))->assertOk();

        $this->assertTrue($user->fresh()->hasVerifiedEmail());
        Event::assertDispatched(Verified::class);
    }

    public function test_a_tampered_link_does_not_verify(): void
    {
        $user = User::factory()->unverified()->create();

        // Same route, no signature at all — the shape an attacker can guess.
        $this->get("/verify-email/{$user->id}/".sha1($user->email))->assertForbidden();

        // Correctly signed, but for a different address than the account holds.
        $this->get($this->verificationUrl($user, 'someone-else@example.com'))->assertForbidden();

        $this->assertFalse($user->fresh()->hasVerifiedEmail());
    }

    public function test_an_expired_link_does_not_verify(): void
    {
        $user = User::factory()->unverified()->create();

        $url = URL::temporarySignedRoute('verification.verify', now()->subMinute(), [
            'id' => $user->id,
            'hash' => sha1($user->getEmailForVerification()),
        ]);

        $this->get($url)->assertForbidden();
        $this->assertFalse($user->fresh()->hasVerifiedEmail());
    }

    public function test_revisiting_an_already_used_link_still_succeeds(): void
    {
        $user = User::factory()->unverified()->create();
        $url = $this->verificationUrl($user);

        $this->get($url)->assertOk();
        // Mail clients pre-fetch links and people re-tap them; neither should
        // land on an error page for something that already worked.
        $this->get($url)->assertOk();

        $this->assertTrue($user->fresh()->hasVerifiedEmail());
    }

    public function test_generating_a_plan_is_blocked_until_the_address_is_verified(): void
    {
        // Otherwise the success case below runs GeneratePlanSteps inline and
        // calls the real Anthropic API.
        Queue::fake();

        $user = User::factory()->unverified()->create();

        $blocked = $this->actingAs($user)->postJson('/api/v1/plans', [
            'prompt' => 'Learn to play the ukulele',
        ]);

        $blocked->assertForbidden();
        $blocked->assertJsonPath('code', 'email_unverified');

        $this->get($this->verificationUrl($user));

        $this->actingAs($user->fresh())->postJson('/api/v1/plans', [
            'prompt' => 'Learn to play the ukulele',
        ])->assertCreated();
    }

    public function test_everything_other_than_generation_still_works_while_unverified(): void
    {
        $user = User::factory()->unverified()->create();

        // The gate is deliberately narrow — an unverified account is not a
        // locked-out account.
        $this->actingAs($user)->getJson('/api/v1/user')->assertOk();
        $this->actingAs($user)->getJson('/api/v1/plans')->assertOk();
    }

    public function test_the_user_endpoint_reports_verification_state(): void
    {
        $user = User::factory()->unverified()->create();

        $this->actingAs($user)->getJson('/api/v1/user')->assertJsonPath('email_verified', false);

        $user->markEmailAsVerified();

        $this->actingAs($user->fresh())->getJson('/api/v1/user')->assertJsonPath('email_verified', true);
    }

    public function test_changing_the_email_clears_verification_and_sends_a_new_link(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $this->assertTrue($user->hasVerifiedEmail());

        $this->actingAs($user)
            ->patchJson('/api/v1/user', ['email' => 'moved@example.com'])
            ->assertOk()
            ->assertJsonPath('email_verified', false);

        $user = $user->fresh();
        $this->assertSame('moved@example.com', $user->email);
        $this->assertFalse($user->hasVerifiedEmail());
        Notification::assertSentTo($user, VerifyEmail::class);
    }

    public function test_changing_only_the_name_leaves_verification_alone(): void
    {
        Notification::fake();

        $user = User::factory()->create();

        $this->actingAs($user)
            ->patchJson('/api/v1/user', ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('email_verified', true);

        $this->assertTrue($user->fresh()->hasVerifiedEmail());
        Notification::assertNothingSent();
    }

    public function test_resend_sends_a_fresh_link_and_is_rate_limited(): void
    {
        Notification::fake();

        $user = User::factory()->unverified()->create();

        $this->actingAs($user)->postJson('/api/v1/email/verification-notification')->assertOk();
        $this->actingAs($user)->postJson('/api/v1/email/verification-notification')->assertOk();
        $this->actingAs($user)->postJson('/api/v1/email/verification-notification')->assertStatus(429);

        Notification::assertSentToTimes($user, VerifyEmail::class, 2);
    }

    public function test_resend_sends_nothing_for_an_already_verified_user(): void
    {
        Notification::fake();

        $user = User::factory()->create();

        // Still a 200 — a stale banner tapped by a verified user isn't an
        // error, there's just nothing to do.
        $this->actingAs($user)->postJson('/api/v1/email/verification-notification')->assertOk();

        Notification::assertNothingSent();
    }
}
