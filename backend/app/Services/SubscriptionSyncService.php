<?php

namespace App\Services;

use App\Enums\NotificationType;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * The single place a user's subscription columns are written.
 *
 * Two things feed it, and they must agree: RevenueCat's webhook (the durable
 * path — fires for renewals, cancellations and billing failures long after
 * the app is closed) and the client-triggered refresh (the immediate path —
 * closes the gap between a purchase completing on-device and the webhook
 * arriving). Both arrive as "here are the entitlements this user holds", so
 * both land here rather than each mapping tiers its own way.
 */
class SubscriptionSyncService
{
    public function __construct(private PushNotificationService $push) {}

    /**
     * Checked in this order — the first match wins, so a user somehow
     * holding both (mid-upgrade, or a grandfathered plan) lands on the
     * higher tier rather than whichever the payload happened to list first.
     *
     * These are RevenueCat entitlement identifiers AND our internal
     * subscription_tier values AND the keys of config('subscriptions.tiers').
     * Keeping all three identical is what avoids a mapping layer.
     */
    public const PAID_TIERS_BY_PRIORITY = ['pro', 'starter'];

    public const PLATFORM_BY_STORE = [
        'app_store' => 'ios',
        'mac_app_store' => 'ios',
        'play_store' => 'android',
    ];

    /**
     * @param  array<int, string>  $entitlementIds  Entitlements the user currently holds.
     */
    public function apply(
        User $user,
        array $entitlementIds,
        ?Carbon $expiresAt,
        ?string $store,
        ?string $status = null,
        ?string $appUserId = null,
    ): User {
        $tier = $this->tierFor($entitlementIds);

        // Captured before the write so the notification below can fire on
        // the *transition* into a billing failure rather than on every
        // payload that mentions one. RevenueCat retries any webhook it
        // doesn't get a 2xx for and re-delivers the same event, so an
        // unconditional send would notify the same user repeatedly about
        // one failed charge.
        $previousStatus = $user->getOriginal('subscription_status');

        // forceFill(), not update() — these fields are deliberately absent
        // from User's #[Fillable] list so a user can never set their own
        // tier via PATCH /user. Only trusted server-side callers reach here.
        $user->forceFill([
            'subscription_tier' => $tier,
            'subscription_status' => $status ?? ($tier !== 'free' ? 'active' : 'expired'),
            'subscription_platform' => self::PLATFORM_BY_STORE[$store] ?? $user->subscription_platform,
            'subscription_expires_at' => $expiresAt,
            'revenuecat_app_user_id' => $appUserId ?? $user->revenuecat_app_user_id,
        ])->save();

        $this->notifyIfPaymentJustFailed($user, $previousStatus);

        return $user;
    }

    /**
     * A failed charge is time-sensitive and entirely fixable — but only by
     * the user, and only if they know. This is the one subscription event
     * worth interrupting someone for.
     */
    private function notifyIfPaymentJustFailed(User $user, ?string $previousStatus): void
    {
        if ($user->subscription_status !== 'past_due' || $previousStatus === 'past_due') {
            return;
        }

        $this->push->send(
            $user,
            NotificationType::PaymentIssue,
            'There was a problem with your payment',
            'Update your billing details to keep your subscription active.',
            data: ['type' => NotificationType::PaymentIssue->value, 'screen' => 'Settings'],
            // Per lapse, not per user: someone whose card fails again months
            // later needs telling again.
            dedupeKey: 'past_due:'.now()->toDateString(),
        );
    }

    /**
     * @param  array<int, string>  $entitlementIds
     */
    public function tierFor(array $entitlementIds): string
    {
        foreach (self::PAID_TIERS_BY_PRIORITY as $candidate) {
            if (in_array($candidate, $entitlementIds, true)) {
                return $candidate;
            }
        }

        return 'free';
    }
}
