<?php

use App\Http\Controllers\EmailVerificationController;
use App\Http\Controllers\SharedPlanRedirectController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

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
