<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The authenticated user, plus their current generation allowance.
 *
 * The allowance is exposed as computed values rather than raw counters so
 * the app can tell people what they have left *before* they invest effort
 * in the new-plan form, without reimplementing canGenerate()'s rules
 * (rolling window, free-tier lifetime generation) on the client.
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            // A boolean, not the timestamp — the app only ever branches on
            // it (banner shown, plan generation gated), and the date itself
            // isn't something anyone is shown.
            'email_verified' => $this->hasVerifiedEmail(),
            'subscription_tier' => $this->subscription_tier,
            'subscription_status' => $this->subscription_status,
            // ISO-8601 so the client can format it in the device's locale.
            // Null on the free tier and for anyone who has never subscribed —
            // the Settings screen keys the "Renews on" row off this rather
            // than off the tier, so a cancelled-but-not-yet-expired
            // subscription still shows when access actually ends.
            'subscription_expires_at' => $this->subscription_expires_at?->toIso8601String(),
            'can_generate' => $this->canGenerate(),
            'generations_remaining' => $this->generationsRemaining(),
            'generations_limit' => $this->monthlyGenerationLimit(),
            // Only present when it actually applies, so the client can't
            // accidentally show "you've hit your limit" to someone who hasn't.
            // Same string the 429 body uses — see User::generationLimitMessage().
            'generation_limit_message' => $this->when(
                ! $this->canGenerate(),
                fn () => $this->generationLimitMessage()
            ),
        ];
    }
}
