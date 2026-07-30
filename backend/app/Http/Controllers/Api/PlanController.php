<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    public function index(Request $request)
    {
        $plans = $request->user()->plans()->with('steps')->latest()->get();

        return PlanResource::collection($plans);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'prompt' => ['required', 'string', 'min:5'],
            'skill_level' => ['nullable', 'in:beginner,intermediate,advanced'],
            'time_commitment' => ['nullable', 'in:light,moderate,intensive'],
            'target_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $plan = $request->user()->plans()->create([
            'title' => str($validated['prompt'])->limit(60),
            'original_prompt' => $validated['prompt'],
            'status' => 'generating',
            'skill_level' => $validated['skill_level'] ?? null,
            'time_commitment' => $validated['time_commitment'] ?? null,
            'target_days' => $validated['target_days'] ?? null,
        ]);

        GeneratePlanSteps::dispatch($plan);

        return response()->json([
            'id' => $plan->id,
            'status' => $plan->status,
        ], 201);
    }

    public function show(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);

        return new PlanResource($plan->load('steps'));
    }
}
