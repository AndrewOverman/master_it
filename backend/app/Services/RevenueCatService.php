<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * Reads subscriber state straight from RevenueCat's REST API.
 *
 * This exists so the refresh endpoint can *verify* rather than trust: the
 * client knows its own purchase succeeded, but a client claim is not
 * evidence. Asking RevenueCat directly means a user can't grant themselves
 * a tier by POSTing a fabricated payload — the app sends nothing but its
 * session token, and the entitlements come from RevenueCat.
 */
class RevenueCatService
{
    private const BASE_URL = 'https://api.revenuecat.com/v1';

    public function isConfigured(): bool
    {
        return ! empty(config('services.revenuecat.secret_api_key'));
    }

    /**
     * The entitlements a subscriber currently holds, with the latest expiry
     * among them and the store they bought through.
     *
     * Returns null when RevenueCat has never heard of this app_user_id —
     * which is the normal case for anyone who has never opened the paywall,
     * not an error.
     *
     * @return array{entitlements: array<int, string>, expires_at: ?Carbon, store: ?string}|null
     */
    public function subscriberEntitlements(string $appUserId): ?array
    {
        $response = Http::withToken(config('services.revenuecat.secret_api_key'))
            ->acceptJson()
            ->timeout(10)
            ->get(self::BASE_URL.'/subscribers/'.urlencode($appUserId));

        if ($response->status() === 404) {
            return null;
        }

        $response->throw();

        $subscriber = $response->json('subscriber') ?? [];
        $now = Carbon::now();

        $active = [];
        $latestExpiry = null;

        foreach ($subscriber['entitlements'] ?? [] as $identifier => $entitlement) {
            $rawExpiry = $entitlement['expires_date'] ?? null;
            // A null expires_date means a lifetime/non-expiring entitlement,
            // which is active by definition — not an entitlement that expired
            // at some unknown time.
            $expiresAt = $rawExpiry ? Carbon::parse($rawExpiry) : null;

            if ($expiresAt !== null && $expiresAt->lte($now)) {
                continue;
            }

            $active[] = $identifier;

            if ($expiresAt === null) {
                $latestExpiry = null;
                break;
            }

            $latestExpiry = $latestExpiry === null ? $expiresAt : $latestExpiry->max($expiresAt);
        }

        return [
            'entitlements' => $active,
            'expires_at' => $latestExpiry,
            'store' => $this->storeFor($subscriber),
        ];
    }

    /**
     * RevenueCat reports the store per-subscription rather than on the
     * subscriber, so this takes the first one it finds. Every subscription a
     * single account holds comes from the same store in practice — the
     * purchase is tied to the signed-in Apple/Google account — and this only
     * feeds a support/debugging column, never an access decision.
     *
     * @param  array<string, mixed>  $subscriber
     */
    private function storeFor(array $subscriber): ?string
    {
        foreach ($subscriber['subscriptions'] ?? [] as $subscription) {
            if (! empty($subscription['store'])) {
                return $subscription['store'];
            }
        }

        return null;
    }
}
