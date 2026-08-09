<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Models\Plan;
use Illuminate\Http\Request;

class SharedPlanController extends Controller
{
    public function show(string $token)
    {
        $plan = $this->findSharedPlan($token);

        return new PlanResource($plan->load('steps'));
    }

    public function copy(Request $request, string $token)
    {
        $plan = $this->findSharedPlan($token);

        // Copying is unlimited on every tier, including free — it doesn't
        // touch the LLM, so there's no cost to gate against.
        $copy = $plan->cloneForUser($request->user());

        return new PlanResource($copy->load('steps'));
    }

    /**
     * An expired token 404s exactly like an unknown or revoked one — a
     * stranger with the link has no way to tell the difference, and
     * shouldn't be able to.
     */
    private function findSharedPlan(string $token): Plan
    {
        return Plan::findValidByShareToken($token) ?? abort(404);
    }
}
