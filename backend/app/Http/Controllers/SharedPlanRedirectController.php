<?php

namespace App\Http\Controllers;

use App\Models\Plan;

// The backend's only public web page — everything else here is the JSON
// API. Deliberately passes only derived scalars (a deep link, an optional
// App Store URL) into the view, never the Plan model itself, so a public,
// unauthenticated visitor can never see a plan's title or content through
// this page — that's still gated behind auth:sanctum on the API.
class SharedPlanRedirectController extends Controller
{
    public function show(string $token)
    {
        $plan = Plan::findValidByShareToken($token);

        if (! $plan) {
            return response()->view('shared-plan', ['deepLink' => null, 'appStoreUrl' => null], 404);
        }

        return view('shared-plan', [
            'deepLink' => config('services.mobile.scheme').'://plans/shared/'.$token,
            'appStoreUrl' => config('services.mobile.app_store_url'),
        ]);
    }
}
