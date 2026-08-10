<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'anthropic' => [
        'api_key' => env('ANTHROPIC_API_KEY'),
        'model' => env('ANTHROPIC_MODEL', 'claude-sonnet-5'),
    ],

    'youtube' => [
        'api_key' => env('YOUTUBE_API_KEY'),
    ],

    'resources' => [
        'max_per_step' => (int) env('MAX_RESOURCES_PER_STEP', 1),
    ],

    'revenuecat' => [
        // Set the same value in the RevenueCat dashboard under
        // Project settings > Integrations > Webhooks > Authorization header.
        'webhook_secret' => env('REVENUECAT_WEBHOOK_SECRET'),

        // The SECRET API key (Project settings > API keys), not one of the
        // public SDK keys the app ships with. Used by RevenueCatService to
        // verify entitlements server-side, so a client can never talk its
        // way into a paid tier. Must never be exposed to the app.
        'secret_api_key' => env('REVENUECAT_SECRET_API_KEY'),
    ],

    'expo' => [
        // Master switch for outbound push. Off unless explicitly enabled,
        // so a dev or staging backend sharing a database can't fire real
        // notifications at devices registered by another environment.
        'enabled' => (bool) env('EXPO_PUSH_ENABLED', false),

        // Optional Expo access token (expo.dev > Account settings > Access
        // tokens). Without it Expo accepts pushes to any token from anyone
        // who has it; with it, only requests bearing this token are
        // honoured. Leave blank in dev, set it in production.
        'access_token' => env('EXPO_ACCESS_TOKEN'),
    ],

    'mobile' => [
        // Must match the `scheme` for whichever app.config.ts APP_VARIANT
        // built the app talking to this backend (development/staging/
        // production — see eas.json), so password-reset emails deep-link
        // into the right build instead of one that isn't installed.
        'scheme' => env('MOBILE_APP_SCHEME', 'masterit'),

        // No App Store listing exists yet — left unset until there is one.
        // The shared-plan landing page omits its "Get the app" link
        // entirely rather than guess at a URL while this is empty.
        'app_store_url' => env('APP_STORE_URL'),
    ],

];
