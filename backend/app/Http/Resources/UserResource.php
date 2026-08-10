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
            // The *effective* tier, not the raw column — a lapsed paid tier
            // reports as 'free' here, because that's what the account can
            // actually do. Serving the stored tier instead would contradict
            // the allowance fields below (tier 'pro' beside a limit of 0) and
            // show a lapsed subscriber a Pro badge in Settings.
            // subscription_status and subscription_expires_at still carry the
            // history, which is what the "Renews/Ends on" row reads.
            'subscription_tier' => $this->effectiveTier(),
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
            // Nested rather than four flat notify_* keys, so the client can
            // render the settings section by iterating instead of naming
            // each switch — adding a category later is then a backend
            // change plus a label, not a new field on the client type.
            'notification_preferences' => [
                'plan_updates' => (bool) $this->notify_plan_updates,
                'reminders' => (bool) $this->notify_reminders,
                'progress' => (bool) $this->notify_progress,
                'account' => (bool) $this->notify_account,
            ],
            // Hour of the user's local day the daily nudge may go out.
            'daily_nudge_hour' => (int) $this->daily_nudge_hour,
            'generation_limit_message' => $this->when(
                ! $this->canGenerate(),
                fn () => $this->generationLimitMessage()
            ),
        ];
    }
}
