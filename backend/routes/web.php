<?php

use App\Http\Controllers\EmailVerificationController;
use App\Http\Controllers\SharedPlanRedirectController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Public and unauthenticated by necessity: these are linked from the sign-up
// screen and the paywall, both of which are reachable before an account
// exists, and Apple checks them from outside the app during review. The paths
// are what src/lib/legal.ts derives from EXPO_PUBLIC_API_URL by default —
// changing either means changing that too.
Route::view('/privacy', 'privacy')->name('privacy');
Route::view('/terms', 'terms')->name('terms');

// Unauthenticated on purpose — a share link has to work for a recipient
// who isn't logged in (or doesn't have the app) yet. Same path suffix the
// mobile app's extractShareToken() already matches on regardless of host
// or scheme, so a future verified universal link on a real domain can
// point here unchanged.
Route::get('/plans/shared/{token}', [SharedPlanRedirectController::class, 'show']);

// A web page rather than a masterit:// deep link like password resets use:
// verification mail is routinely opened on a desktop or in a webmail tab,
// where a custom scheme does nothing at all. Unauthenticated for the same
// reason — the signed URL is the credential. The name is what
// Illuminate\Auth\Notifications\VerifyEmail builds its link from.
Route::get('/verify-email/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->middleware('throttle:6,1')
    ->name('verification.verify');
