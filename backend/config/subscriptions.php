<?php

return [

    // Monthly AI-generation allowance per tier. Copying featured/shared
    // plans is unlimited on every tier, including free, and isn't
    // represented here — see Plan::cloneForUser(). The free tier's one-time
    // lifetime generation isn't here either — it's tracked directly via
    // User::$free_generation_claimed_at, since it's a single use, not a
    // recurring allowance.
    //
    // Keys match the RevenueCat entitlement identifiers exactly — see
    // SubscriptionSyncService::PAID_TIERS_BY_PRIORITY.
    //
    // `monthly_generations` is the contract enforced by User::canGenerate()
    // AND the number advertised on the paywall (served by
    // SubscriptionController::tiers), so the promise and the enforcement
    // can't drift apart.
    //
    // Prices deliberately aren't here. The paywall shows the localized
    // `priceString` from the store, which is the only correct figure across
    // storefronts, currencies, and regional tax — a hardcoded "$9.99" would
    // be wrong for most of the world and can't be changed without a release.
    'tiers' => [
        'free' => [
            'name' => 'Free',
            'monthly_generations' => 0,
        ],
        'starter' => [
            'name' => 'Starter',
            'monthly_generations' => 10,
        ],
        'pro' => [
            'name' => 'Pro',
            'monthly_generations' => 25,
        ],
    ],

];
