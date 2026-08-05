<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    public function index(Request $request)
    {
        $plans = $request->user()->plans()->with(['steps', 'latestRefinement'])->latest()->get();

        return PlanResource::collection($plans);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        // Plan generation calls a paid LLM API, so it's gated by the user's
        // subscription tier (plus a one-time free generation) rather than
        // the flat per-account cap copying uses. See User::canGenerate().
        if (! $user->canGenerate()) {
            return response()->json(['message' => $this->generationLimitMessage($user)], 429);
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

        // Charged on dispatch, not on successful completion — a plan that
        // later fails to generate still consumes the allowance. Revisit if
        // that turns out to be worth refunding on failure.
        $user->recordGeneration();

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

    public function reset(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);

        $plan->update(['completed_at' => null]);
        $plan->steps()->update(['completed_at' => null]);

        return new PlanResource($plan->load('steps'));
    }

    public function refine(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);

        $user = $request->user();

        if (! $user->canGenerate()) {
            return response()->json(['message' => $this->generationLimitMessage($user)], 429);
        }

        $validated = $request->validate([
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'in:'.implode(',', GeneratePlanSteps::availableTags())],
            'notes' => ['nullable', 'string', 'max:280'],
        ]);

        if (empty($validated['tags']) && empty($validated['notes'])) {
            return response()->json([
                'message' => 'Add at least one tag or a note describing what to change.',
            ], 422);
        }

        // Atomically claims the plan: enforces "must be ready" and closes a
        // double-tap race in one shot. Two near-simultaneous requests can't
        // both succeed here, so only one ever reaches the charge/dispatch
        // below — without this, both could create a PlanRefinement, both
        // call recordGeneration() for what's really one logical action, and
        // both dispatch a job racing to replace the same plan's steps.
        $flipped = Plan::whereKey($plan->id)->where('status', 'ready')->update(['status' => 'generating']);
        abort_unless($flipped === 1, 422);

        $plan->refinements()->create([
            'tags' => $validated['tags'] ?? [],
            'notes' => $validated['notes'] ?? null,
            'status' => 'pending',
        ]);

        $user->recordGeneration();

        GeneratePlanSteps::dispatch($plan, isRefinement: true);

        return response()->json(['id' => $plan->id, 'status' => 'generating'], 202);
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

        // Copying is unlimited on every tier, including free — it doesn't
        // touch the LLM, so there's no cost to gate against.
        $copy = $plan->cloneForUser($request->user());

        return new PlanResource($copy->load('steps'));
    }

    public function share(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);
        abort_unless($plan->status === 'ready', 422);

        return response()->json(['share_token' => $plan->shareToken()]);
    }

    public function unshare(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);

        $plan->revokeShareToken();

        return response()->noContent();
    }

    private function generationLimitMessage(User $user): string
    {
        return $user->hasActiveSubscription()
            ? "You've reached your monthly limit of {$user->monthlyGenerationLimit()} generated plans."
            : 'You\'ve used your free plan generation. Subscribe to generate more.';
    }
}
