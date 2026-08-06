<?php

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
