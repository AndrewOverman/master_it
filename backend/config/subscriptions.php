<?php

return [

    // Monthly AI-generation allowance per tier. Copying featured/shared
    // plans is unlimited on every tier, including free, and isn't
    // represented here — see Plan::cloneForUser(). The free tier's one-time
    // lifetime generation isn't here either — it's tracked directly via
    // User::$free_generation_claimed_at, since it's a single use, not a
    // recurring allowance.
    //
    // Exact numbers are placeholders until pricing is finalized.
    'tiers' => [
        'free' => [
            'monthly_generations' => 0,
        ],
        'starter' => [
            'monthly_generations' => 10,
        ],
        'pro' => [
            'monthly_generations' => 30,
        ],
    ],

];
