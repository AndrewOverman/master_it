<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanStepResource;
use App\Models\Plan;
use App\Models\PlanStep;
use Illuminate\Http\Request;

class PlanStepController extends Controller
{
    public function update(Request $request, Plan $plan, PlanStep $step)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);
        abort_unless($step->plan_id === $plan->id, 404);

        $validated = $request->validate([
            'completed' => ['required', 'boolean'],
        ]);

        $step->update([
            'completed_at' => $validated['completed'] ? now() : null,
        ]);

        return new PlanStepResource($step);
    }
}
