<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SubscriptionSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class RevenueCatWebhookController extends Controller
{
    public function __construct(private readonly SubscriptionSyncService $sync) {}

    public function handle(Request $request)
    {
        $this->verifySignature($request);

        $event = $request->input('event', []);
        $appUserId = $event['app_user_id'] ?? null;

        if (! $appUserId) {
            return response()->json(['message' => 'Missing event.app_user_id'], 422);
        }

        // Convention: the mobile app configures RevenueCat with our own
        // user ID as the app_user_id at login, so no separate identity
        // linking step is needed — this is a direct primary-key lookup.
        $user = User::find($appUserId);

        if (! $user) {
            // RevenueCat retries on any non-2xx response. An unrecognized
            // app_user_id is expected for RevenueCat's own TEST events and
            // isn't something retrying would fix, so acknowledge it.
            Log::warning('RevenueCat webhook for unknown app_user_id', [
                'app_user_id' => $appUserId,
                'type' => $event['type'] ?? null,
            ]);

            return response()->noContent();
        }

        $this->applyEvent($user, $event);

        return response()->noContent();
    }

    private function verifySignature(Request $request): void
    {
        $expected = config('services.revenuecat.webhook_secret');
        $provided = $request->header('Authorization');

        abort_unless(
            $expected && $provided && hash_equals($expected, $provided),
            401
        );
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function applyEvent(User $user, array $event): void
    {
        $type = $event['type'] ?? null;
        $entitlementIds = $event['entitlement_ids'] ?? [];
        $expirationMs = $event['expiration_at_ms'] ?? null;

        $tier = $this->sync->tierFor($entitlementIds);

        $this->sync->apply(
            user: $user,
            entitlementIds: $entitlementIds,
            expiresAt: $this->expiryFor($user, $tier, $expirationMs),
            store: $event['store'] ?? null,
            status: $this->statusFor($type, $tier !== 'free'),
            appUserId: $event['app_user_id'] ?? null,
        );
    }

    /**
     * When the payload grants a paid tier but carries no expiry, keep the one
     * already stored instead of clearing it.
     *
     * A null expiry on a paid tier means "never expires" downstream (see
     * User::hasActiveSubscription()), so writing null on the strength of a
     * *missing* field would hand out permanent access — the same leak as
     * trusting a stale tier, arrived at from the other direction. This is the
     * unverified path: it maps whatever payload showed up. Establishing a
     * genuinely non-expiring entitlement is left to the refresh endpoint,
     * which reads each entitlement's expires_date from RevenueCat directly.
     *
     * An event that resolves to the free tier still clears the expiry — there
     * the null is meaningful rather than absent.
     */
    private function expiryFor(User $user, string $tier, mixed $expirationMs): ?Carbon
    {
        if ($expirationMs) {
            return Carbon::createFromTimestampMs($expirationMs);
        }

        if ($tier === 'free') {
            return null;
        }

        // Nothing to fall back to: the account has never held a dated
        // subscription, so this grant would be indefinite. Worth seeing in the
        // logs — it means either a product type this app doesn't sell, or a
        // payload shape that changed.
        if ($user->subscription_expires_at === null) {
            Log::warning('RevenueCat webhook granted a paid tier with no expiry available', [
                'user_id' => $user->id,
                'tier' => $tier,
            ]);
        }

        return $user->subscription_expires_at;
    }

    /**
     * Best-effort, human-readable status for support/debugging. Not load-
     * bearing for access — User::hasActiveSubscription() and canGenerate()
     * key off subscription_tier + subscription_expires_at, never this
     * field, so an unmapped event type degrading to a generic status here
     * can't accidentally lock someone out or leak access.
     */
    private function statusFor(?string $type, bool $hasActiveTier): string
    {
        return match ($type) {
            'EXPIRATION' => 'expired',
            'CANCELLATION' => 'canceled',
            'BILLING_ISSUE' => 'past_due',
            default => $hasActiveTier ? 'active' : 'expired',
        };
    }
}
