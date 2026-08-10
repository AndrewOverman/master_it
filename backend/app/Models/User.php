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

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

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
        ];
    }

    public function plans(): HasMany
    {
        return $this->hasMany(Plan::class);
    }

    public function deviceAttestations(): HasMany
    {
        return $this->hasMany(DeviceAttestation::class, 'claimed_by_user_id');
    }

    public function hasActiveSubscription(): bool
    {
        return $this->subscription_expires_at !== null
            && $this->subscription_expires_at->isFuture();
    }

    public function monthlyGenerationLimit(): int
    {
        return config("subscriptions.tiers.{$this->subscription_tier}.monthly_generations", 0);
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
        // back to it just because they never happened to use it.
        return $this->subscription_tier === 'free' && $this->free_generation_claimed_at === null;
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

        if ($remaining === 0 && $this->subscription_tier === 'free' && $this->free_generation_claimed_at === null) {
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
        return $this->hasActiveSubscription()
            ? "You've reached your monthly limit of {$this->monthlyGenerationLimit()} generated plans."
            : "You've used your free plan generation. Subscribe to generate more.";
    }

    public function recordGeneration(): void
    {
        $this->resetGenerationPeriodIfElapsed();

        if ($this->plans_generated_count >= $this->monthlyGenerationLimit() && $this->subscription_tier === 'free') {
            $this->free_generation_claimed_at = Carbon::now();
        }

        $this->plans_generated_count++;
        $this->save();
    }
}
