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
            expiresAt: $expirationMs ? Carbon::createFromTimestampMs($expirationMs) : null,
            store: $event['store'] ?? null,
            status: $this->statusFor($type, $tier !== 'free'),
            appUserId: $event['app_user_id'] ?? null,
        );
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
