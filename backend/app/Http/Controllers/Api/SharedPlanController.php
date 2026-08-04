<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Models\Plan;
use Illuminate\Http\Request;

class SharedPlanController extends Controller
{
    public function show(Request $request, string $token)
    {
        $plan = $this->findSharedPlan($token);

        return new PlanResource($plan->load('steps'));
    }

    public function copy(Request $request, string $token)
    {
        $plan = $this->findSharedPlan($token);

        $user = $request->user();

        if ($user->plans()->count() >= $user->max_plans) {
            return response()->json([
                'message' => 'You\'ve reached the limit of '.$user->max_plans.' plans for this account.',
            ], 429);
        }

        $copy = $plan->cloneForUser($user);

        return new PlanResource($copy->load('steps'));
    }

    /**
     * An expired token 404s exactly like an unknown or revoked one — a
     * stranger with the link has no way to tell the difference, and
     * shouldn't be able to.
     */
    private function findSharedPlan(string $token): Plan
    {
        $plan = Plan::where('share_token', $token)->firstOrFail();

        abort_unless($plan->status === 'ready', 404);
        abort_if($plan->isShareTokenExpired(), 404);

        return $plan;
    }
}
