<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
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
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

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
