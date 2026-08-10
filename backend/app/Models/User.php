<?php

namespace App\Models;

use App\Notifications\VerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'name',
    'email',
    'password',
    // Notification settings are user-owned and edited through the same
    // PATCH /user endpoint as the profile fields, so they belong here.
    // Nothing else about the account is mass-assignable — subscription and
    // generation columns are still written only via forceFill/explicit
    // assignment, because those are the app's word, not the user's.
    'notify_plan_updates',
    'notify_reminders',
    'notify_progress',
    'notify_account',
    'daily_nudge_hour',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Mirrors the column defaults in the notification-preferences
     * migration.
     *
     * Needed because a model that was just created holds only the
     * attributes that were explicitly written — a column default applied
     * by the database isn't read back. Without this, a user who registers
     * and is notified in the same request has every preference read as
     * null, which is falsy, and would silently receive nothing.
     */
    protected $attributes = [
        'notify_plan_updates' => true,
        'notify_reminders' => true,
        'notify_progress' => true,
        'notify_account' => true,
        'daily_nudge_hour' => 9,
    ];

    /**
     * Overridden only to swap in the queued notification — sending is an HTTP
     * call to Resend, and registration shouldn't wait on it. Nothing else
     * about the framework's verification flow changes.
     */
    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerifyEmail);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'subscription_expires_at' => 'datetime',
            'generation_period_started_at' => 'datetime',
            'free_generation_claimed_at' => 'datetime',
            'notify_plan_updates' => 'boolean',
            'notify_reminders' => 'boolean',
            'notify_progress' => 'boolean',
            'notify_account' => 'boolean',
        ];
    }

    public function plans(): HasMany
    {
        return $this->hasMany(Plan::class);
    }

    public function pushTokens(): HasMany
    {
        return $this->hasMany(PushToken::class);
    }

    public function notificationDeliveries(): HasMany
    {
        return $this->hasMany(NotificationDelivery::class);
    }

    /**
     * The timezone to interpret this user's "day" in — for the nudge hour,
     * for quiet hours, and for deciding which steps count as due today.
     *
     * Read off the most recently registered device rather than stored on
     * the account, because the device is the only thing that actually
     * knows. A user with phones in two zones gets whichever they used
     * last, which is the better guess than either a stale column or UTC.
     */
    public function timezone(): string
    {
        return $this->pushTokens()
            ->orderByDesc('last_seen_at')
            ->value('timezone') ?? 'UTC';
    }

    public function deviceAttestations(): HasMany
    {
        return $this->hasMany(DeviceAttestation::class, 'claimed_by_user_id');
    }

    public function hasActiveSubscription(): bool
    {
        if ($this->subscription_tier === null || $this->subscription_tier === 'free') {
            return false;
        }

        // A null expiry on a paid tier is a lifetime / non-expiring
        // entitlement, not one that lapsed at an unknown time —
        // RevenueCatService reports those with expires_at = null by design,
        // and reading null as "expired" would lock out exactly the people
        // who paid the most.
        return $this->subscription_expires_at === null
            || $this->subscription_expires_at->isFuture();
    }

    /**
     * The tier whose allowance actually applies right now.
     *
     * Deliberately distinct from the `subscription_tier` column, which
     * records what the store last told us the user held. A paid tier whose
     * expiry has passed stays in that column until something clears it, and
     * nothing is guaranteed to: a webhook can be missed, retried past
     * exhaustion, or rejected while the endpoint is down, and the refresh
     * endpoint only runs when the user opens the paywall — which someone
     * who has already churned has no reason to do.
     *
     * So access is keyed off this, never off the raw column. Everything that
     * grants or counts generations goes through it.
     */
    public function effectiveTier(): string
    {
        return $this->hasActiveSubscription() ? $this->subscription_tier : 'free';
    }

    public function monthlyGenerationLimit(): int
    {
        return config("subscriptions.tiers.{$this->effectiveTier()}.monthly_generations", 0);
    }

    /**
     * Resets the rolling monthly window if the last one has elapsed. Called
     * before reading or consuming plans_generated_count so the count never
     * needs a scheduled job to stay accurate.
     */
    public function resetGenerationPeriodIfElapsed(): void
    {
        if ($this->generation_period_started_at === null
            || $this->generation_period_started_at->lt(Carbon::now()->subMonth())) {
            $this->generation_period_started_at = Carbon::now();
            $this->plans_generated_count = 0;
        }
    }

    public function canGenerate(): bool
    {
        $this->resetGenerationPeriodIfElapsed();

        if ($this->plans_generated_count < $this->monthlyGenerationLimit()) {
            return true;
        }

        // The one-time free generation is a free-tier concept only — a
        // subscriber who has exhausted their monthly allowance doesn't fall
        // back to it just because they never happened to use it. A lapsed
        // subscriber is on the free tier again, so they do reach it, if they
        // never claimed it while free the first time.
        return $this->effectiveTier() === 'free' && $this->free_generation_claimed_at === null;
    }

    /**
     * How many plan generations are left right now.
     *
     * Kept beside canGenerate() rather than recomputed on the client so the
     * two can't drift — this has to account for the rolling-window reset and
     * the free tier's one-time lifetime generation, neither of which is
     * derivable from plans_generated_count alone.
     */
    public function generationsRemaining(): int
    {
        $this->resetGenerationPeriodIfElapsed();

        $remaining = max(0, $this->monthlyGenerationLimit() - $this->plans_generated_count);

        if ($remaining === 0 && $this->effectiveTier() === 'free' && $this->free_generation_claimed_at === null) {
            return 1;
        }

        return $remaining;
    }

    /**
     * Why the user can't generate right now, in their own terms. Lives here
     * rather than in PlanController so the 429 body and the up-front notice
     * on the new-plan form are guaranteed to say the same thing.
     */
    public function generationLimitMessage(): string
    {
        if ($this->hasActiveSubscription()) {
            return "You've reached your monthly limit of {$this->monthlyGenerationLimit()} generated plans.";
        }

        // Someone holding a lapsed paid tier has been paying us. Telling them
        // they've "used their free plan generation" reads as the app having
        // lost their subscription, which is the last thing to say to a
        // churned subscriber you'd like back.
        if ($this->subscription_tier !== null && $this->subscription_tier !== 'free') {
            return 'Your subscription has expired. Resubscribe to generate more plans.';
        }

        return "You've used your free plan generation. Subscribe to generate more.";
    }

    public function recordGeneration(): void
    {
        $this->resetGenerationPeriodIfElapsed();

        if ($this->plans_generated_count >= $this->monthlyGenerationLimit() && $this->effectiveTier() === 'free') {
            $this->free_generation_claimed_at = Carbon::now();
        }

        $this->plans_generated_count++;
        $this->save();
    }
}
