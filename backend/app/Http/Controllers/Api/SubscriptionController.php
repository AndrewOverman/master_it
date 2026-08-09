<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\RevenueCatService;
use App\Services\SubscriptionSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class SubscriptionController extends Controller
{
    public function __construct(
        private readonly RevenueCatService $revenueCat,
        private readonly SubscriptionSyncService $sync,
    ) {}

    /**
     * The tier catalog, for the paywall.
     *
     * Serves the same config('subscriptions.tiers') that User::canGenerate()
     * enforces, so the number advertised on the paywall is by construction
     * the number the API will actually honour. Prices are NOT here — those
     * come from the store via RevenueCat's localized priceString, which is
     * the only figure that's correct in every storefront and currency.
     */
    public function tiers()
    {
        $tiers = collect(config('subscriptions.tiers', []))
            ->map(fn (array $tier, string $id) => [
                'id' => $id,
                'name' => $tier['name'] ?? ucfirst($id),
                'monthly_generations' => $tier['monthly_generations'] ?? 0,
            ])
            ->values();

        return response()->json(['data' => $tiers]);
    }

    /**
     * Reconciles this user's subscription against RevenueCat, right now.
     *
     * The webhook is the durable path, but it's asynchronous — without this,
     * someone who has just paid sees "you're out of generations" until it
     * lands. The app calls this immediately after a successful purchase or
     * restore.
     *
     * Note what this endpoint does NOT accept: any description of what the
     * user bought. It takes no body at all. The entitlements are fetched
     * from RevenueCat using the authenticated user's own ID, so the request
     * can't be used to grant a tier — the worst a malicious caller achieves
     * is re-syncing their own real subscription.
     */
    public function refresh(Request $request)
    {
        $user = $request->user();

        if (! $this->revenueCat->isConfigured()) {
            // Nothing to reconcile against. Returning the user unchanged
            // rather than erroring keeps dev and staging builds — where
            // RevenueCat isn't set up — working normally.
            return new UserResource($user);
        }

        // The app configures RevenueCat with our primary key as the
        // app_user_id (see src/lib/purchases.ts), so this is the same
        // identity the webhook resolves against. Falls back to the stored
        // value for anyone whose ID was aliased from an anonymous one.
        $appUserId = (string) ($user->revenuecat_app_user_id ?? $user->id);

        try {
            $state = $this->revenueCat->subscriberEntitlements($appUserId);
        } catch (\Throwable $e) {
            // A RevenueCat outage must not read as "your subscription is
            // gone". Report the user as-is and let the webhook reconcile.
            Log::warning('RevenueCat refresh failed', [
                'user_id' => $user->id,
                'message' => $e->getMessage(),
            ]);

            return new UserResource($user);
        }

        // null means RevenueCat has never seen this ID — normal for anyone
        // who hasn't opened the paywall. Downgrading them on that basis
        // would strip a tier the webhook had legitimately granted.
        if ($state === null) {
            return new UserResource($user);
        }

        $this->sync->apply(
            user: $user,
            entitlementIds: $state['entitlements'],
            expiresAt: $state['expires_at'],
            store: $state['store'],
            appUserId: $appUserId,
        );

        return new UserResource($user->refresh());
    }
}
