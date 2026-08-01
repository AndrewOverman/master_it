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
        $user = $request->user();

        // Plan generation calls a paid LLM API, so cap how many plans a user
        // can burn credits creating. Per-user so limits can be raised
        // individually (e.g. for internal testing) without a code change.
        if ($user->plans()->count() >= $user->max_plans) {
            return response()->json([
                'message' => 'You\'ve reached the limit of '.$user->max_plans.' plans for this account.',
            ], 429);
        }

        $validated = $request->validate([
            'prompt' => ['required', 'string', 'min:5'],
            'skill_level' => ['nullable', 'in:beginner,intermediate,advanced'],
            'time_commitment' => ['nullable', 'in:light,moderate,intensive'],
            'target_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $plan = $user->plans()->create([
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

    public function update(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);

        $validated = $request->validate([
            'completed' => ['required', 'boolean'],
        ]);

        $plan->update([
            'completed_at' => $validated['completed'] ? now() : null,
        ]);

        return new PlanResource($plan);
    }

    public function featured(Request $request)
    {
        $plans = Plan::with('steps')
            ->where('is_featured', true)
            ->where('status', 'ready') // never showcase a generating/failed plan
            ->latest()
            ->paginate(10);

        return PlanResource::collection($plans);
    }

    public function related(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);

        $related = Plan::with('steps')
            ->where('is_featured', true)
            ->where('status', 'ready')
            ->where('id', '!=', $plan->id)
            // Exclude the featured plan this one was copied from — its
            // original_prompt is identical, so it would otherwise always
            // rank first and show the user the plan they just added.
            ->when($plan->source_plan_id, fn ($query, $sourcePlanId) => $query->where('id', '!=', $sourcePlanId))
            ->whereRaw("to_tsvector('english', original_prompt) @@ plainto_tsquery('english', ?)", [$plan->original_prompt])
            ->orderByRaw("ts_rank(to_tsvector('english', original_prompt), plainto_tsquery('english', ?)) DESC", [$plan->original_prompt])
            ->limit(5)
            ->get();

        return PlanResource::collection($related);
    }

    public function copy(Request $request, Plan $plan)
    {
        // Deliberately not an ownership check — this plan usually belongs
        // to someone else. Copying is authorized by the plan being
        // featured and finished generating, not by who owns it.
        abort_unless($plan->is_featured && $plan->status === 'ready', 404);

        $user = $request->user();

        if ($user->plans()->count() >= $user->max_plans) {
            return response()->json([
                'message' => 'You\'ve reached the limit of '.$user->max_plans.' plans for this account.',
            ], 429);
        }

        $copy = $user->plans()->create([
            'source_plan_id' => $plan->id,
            'title' => $plan->title,
            'emoji' => $plan->emoji,
            'original_prompt' => $plan->original_prompt,
            'status' => 'ready',
            'skill_level' => $plan->skill_level,
            'time_commitment' => $plan->time_commitment,
            'target_days' => $plan->target_days,
        ]);

        // Mirrors GeneratePlanSteps::handle()'s cumulative-due-date logic,
        // anchored on now() instead of the source plan's original
        // created_at so the copy's due dates land in the future.
        $cumulativeDays = 0;
        foreach ($plan->steps()->with('resources')->get() as $step) {
            $cumulativeDays += $step->estimated_days ?? 0;

            $newStep = $copy->steps()->create([
                'order' => $step->order,
                'title' => $step->title,
                'description' => $step->description,
                'estimated_days' => $step->estimated_days,
                'due_date' => now()->copy()->addDays($cumulativeDays),
                'video_url' => $step->video_url,
                'video_title' => $step->video_title,
                'video_channel' => $step->video_channel,
                'video_view_count' => $step->video_view_count,
                'video_published_at' => $step->video_published_at,
                'resources_fetched_at' => $step->resources_fetched_at,
            ]);

            foreach ($step->resources as $resource) {
                $newStep->resources()->create([
                    'url' => $resource->url,
                    'title' => $resource->title,
                    'source' => $resource->source,
                    'description' => $resource->description,
                    'order' => $resource->order,
                ]);
            }
        }

        return new PlanResource($copy->load('steps'));
    }
}
