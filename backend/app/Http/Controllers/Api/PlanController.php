<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Jobs\GeneratePlanSteps;
use App\Models\Plan;
use App\Models\PlanFeedback;
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
            return response()->json(['message' => $user->generationLimitMessage()], 429);
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

    /**
     * Re-runs generation for a plan whose job failed, reusing the inputs
     * already stored on the plan.
     *
     * Deliberately does NOT call recordGeneration(): store() charges the
     * allowance on dispatch and never refunds it, so the user has already
     * paid for this plan once. Making them create a fresh plan instead
     * would bill them a second time for something they never received.
     * Only 'failed' qualifies — 'rejected' means the goal itself was out of
     * bounds, and re-running the identical prompt would just reject again.
     */
    public function retry(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);

        if ($plan->status !== 'failed') {
            return response()->json([
                'message' => 'This plan is not in a state that can be retried.',
            ], 409);
        }

        $plan->update([
            'status' => 'generating',
            'error_message' => null,
        ]);

        GeneratePlanSteps::dispatch($plan);

        return response()->json(['id' => $plan->id, 'status' => 'generating'], 202);
    }

    public function show(Request $request, Plan $plan)
    {
        // Readable by its owner, or by anyone when it's a finished featured
        // plan — the same basis copy() authorizes on. Without this there was
        // no way to look at a featured plan's steps before adding it to your
        // own, which made "add" a decision taken blind. Owner-only fields
        // (share_token, latest_refinement) stay gated inside PlanResource.
        abort_unless(
            $plan->user_id === $request->user()->id || ($plan->is_featured && $plan->status === 'ready'),
            404
        );

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
            return response()->json(['message' => $user->generationLimitMessage()], 429);
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

    public function feedback(Request $request, Plan $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);

        $validated = $request->validate([
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'in:'.implode(',', PlanFeedback::availableTags())],
        ]);

        if (empty($validated['rating']) && empty($validated['tags'])) {
            return response()->json([
                'message' => 'Add a rating or at least one tag.',
            ], 422);
        }

        // Replaces any earlier review rather than appending: finishing a plan
        // more than once (steps can be unchecked and re-checked freely) shows
        // the prompt again, and what we want to keep is the user's latest
        // word on the plan, not a pile of partial impressions.
        $plan->feedback()->updateOrCreate(
            ['plan_id' => $plan->id],
            [
                'rating' => $validated['rating'] ?? null,
                'tags' => $validated['tags'] ?? [],
            ]
        );

        return response()->json(null, 201);
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

}
