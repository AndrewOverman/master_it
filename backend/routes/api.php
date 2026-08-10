<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\PlanStepController;
use App\Http\Controllers\Api\PushTokenController;
use App\Http\Controllers\Api\RevenueCatWebhookController;
use App\Http\Controllers\Api\SharedPlanController;
use App\Http\Controllers\Api\SubscriptionController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:forgot-password');
    Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:forgot-password');

    // Authenticated via the Authorization-header shared secret configured
    // in the RevenueCat dashboard, not Sanctum — RevenueCat is the caller.
    Route::post('webhooks/revenuecat', [RevenueCatWebhookController::class, 'handle']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [AuthController::class, 'logout']);

        // Deliberately inside the auth group: only the account's own owner can
        // ask for another verification mail, so this can't be used to send
        // mail to an address the caller doesn't already hold a token for.
        Route::post('email/verification-notification', [AuthController::class, 'resendVerification'])
            ->middleware('throttle:verification-send');

        Route::get('user', [UserController::class, 'show']);
        Route::patch('user', [UserController::class, 'update']);
        // Takes no body — see SubscriptionController::refresh(). Throttled
        // because each call is an outbound request to RevenueCat, and the
        // client retries it on a backoff after a purchase.
        Route::post('user/subscription/refresh', [SubscriptionController::class, 'refresh'])
            ->middleware('throttle:subscription-refresh');
        // Throttled because the app re-registers on every launch and after
        // every permission change, so a restart loop on one device
        // shouldn't be able to hammer this.
        Route::post('push-tokens', [PushTokenController::class, 'store'])
            ->middleware('throttle:push-token');
        Route::delete('push-tokens', [PushTokenController::class, 'destroy']);

        Route::get('user/export', [UserController::class, 'export']);
        Route::delete('user', [UserController::class, 'destroy']);

        // Static catalog, but kept behind auth like everything else here —
        // the paywall is only reachable when signed in, so there's no caller
        // that needs it public.
        Route::get('subscriptions/tiers', [SubscriptionController::class, 'tiers']);

        Route::get('plans', [PlanController::class, 'index']);
        // The only route gated on a verified address. Generation is what
        // costs real money per signup (see User::canGenerate()'s free
        // lifetime generation), so it's the one place worth the friction —
        // everything else stays usable while an account is unverified.
        Route::post('plans', [PlanController::class, 'store'])->middleware('verified');
        Route::get('plans/featured', [PlanController::class, 'featured']);
        Route::get('plans/shared/{token}', [SharedPlanController::class, 'show']);
        Route::post('plans/shared/{token}/copy', [SharedPlanController::class, 'copy']);
        Route::post('plans/{plan}/copy', [PlanController::class, 'copy']);
        Route::get('plans/{plan}/related', [PlanController::class, 'related']);
        Route::get('plans/{plan}', [PlanController::class, 'show']);
        Route::patch('plans/{plan}', [PlanController::class, 'update']);
        Route::post('plans/{plan}/reset', [PlanController::class, 'reset']);
        Route::post('plans/{plan}/retry', [PlanController::class, 'retry']);
        Route::post('plans/{plan}/refine', [PlanController::class, 'refine']);
        Route::post('plans/{plan}/feedback', [PlanController::class, 'feedback']);
        Route::post('plans/{plan}/share', [PlanController::class, 'share']);
        Route::delete('plans/{plan}/share', [PlanController::class, 'unshare']);
        Route::get('plans/{plan}/steps/{step}', [PlanStepController::class, 'show']);
        Route::patch('plans/{plan}/steps/{step}', [PlanStepController::class, 'update']);
    });
});
